// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial

/**
 * Web Discovery — search GitHub for skills not in the local catalog.
 * Called as a fallback when activateSkills() finds zero matches.
 */

import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, rename, mkdir } from "fs/promises";

// ── Cache Types ──────────────────────────────────────

export interface DiscoveryCacheEntry {
  results: DiscoveredSkill[];
  timestamp: string;
  ttl_hours: number;
}

export interface DiscoveryCache {
  entries: Record<string, DiscoveryCacheEntry>;
}

const CACHE_DIR = join(homedir(), ".superskill");
const CACHE_FILE = join(CACHE_DIR, "discovery-cache.json");
const DEFAULT_TTL_HOURS = 24;
const MAX_CACHE_ENTRIES = 100;

/** Visible for testing — override cache file path. */
export let _cacheFilePath = CACHE_FILE;
export function _setCacheFilePath(p: string): void {
  _cacheFilePath = p;
}
export function _resetCacheFilePath(): void {
  _cacheFilePath = CACHE_FILE;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  source_url: string;
  repo: string;
  stars: number;
  updated_at: string;
  path: string;
}

export interface WebDiscoveryResult {
  success: boolean;
  results: DiscoveredSkill[];
  error?: string;
}

// ── Cache Helpers ────────────────────────────────────

/**
 * Normalize a task string into a stable cache key.
 * Lowercase, extract keywords, sort alphabetically, join with "+".
 */
export function normalizeCacheKey(task: string): string {
  const kw = extractKeywords(task);
  return kw.sort().join("+");
}

async function readCache(): Promise<DiscoveryCache> {
  try {
    const raw = await readFile(_cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object") {
      return parsed as DiscoveryCache;
    }
    return { entries: {} };
  } catch {
    return { entries: {} };
  }
}

async function writeCache(cache: DiscoveryCache): Promise<void> {
  try {
    const dir = _cacheFilePath.substring(0, _cacheFilePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    const tmp = _cacheFilePath + ".tmp." + process.pid;
    await writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
    await rename(tmp, _cacheFilePath);
  } catch {
    // Never crash on cache write failure
  }
}

function isCacheEntryValid(entry: DiscoveryCacheEntry): boolean {
  const age = Date.now() - new Date(entry.timestamp).getTime();
  const ttlMs = (entry.ttl_hours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  return age < ttlMs;
}

function evictOldest(cache: DiscoveryCache): void {
  const keys = Object.keys(cache.entries);
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  // Sort by timestamp ascending (oldest first), evict extras
  const sorted = keys.sort((a, b) => {
    const ta = new Date(cache.entries[a].timestamp).getTime();
    const tb = new Date(cache.entries[b].timestamp).getTime();
    return ta - tb;
  });

  const toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
  for (const key of toRemove) {
    delete cache.entries[key];
  }
}

/**
 * Clear the discovery cache. Exported for testing.
 */
export async function clearDiscoveryCache(): Promise<void> {
  await writeCache({ entries: {} });
}

/**
 * Search GitHub for SKILL.md files matching a task description.
 * Uses the GitHub Search API (code search + repo search).
 * Unauthenticated: 10 req/min. With GITHUB_TOKEN: 30 req/min.
 *
 * Results are cached for 24 hours at ~/.superskill/discovery-cache.json
 * to avoid hitting GitHub API rate limits.
 */
export async function searchGitHubForSkills(task: string): Promise<WebDiscoveryResult> {
  const keywords = extractKeywords(task);
  if (keywords.length === 0) {
    return { success: false, results: [], error: "Could not extract search keywords from task" };
  }

  const cacheKey = normalizeCacheKey(task);

  // Check cache
  if (cacheKey) {
    const cache = await readCache();
    const entry = cache.entries[cacheKey];
    if (entry && isCacheEntryValid(entry)) {
      return { success: true, results: entry.results };
    }
  }

  const query = buildSearchQuery(keywords);

  try {
    // Search for repos with SKILL.md files matching keywords
    const results = await Promise.allSettled([
      searchGitHubCode(query),
      searchGitHubRepos(keywords),
    ]);

    const skills: DiscoveredSkill[] = [];
    const seenRepos = new Set<string>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const skill of result.value) {
          if (!seenRepos.has(skill.repo)) {
            skills.push(skill);
            seenRepos.add(skill.repo);
          }
        }
      }
    }

    // Sort by stars descending (trust signal)
    skills.sort((a, b) => b.stars - a.stars);

    // Cap at 5 results
    const capped = skills.slice(0, 5);

    // Store in cache
    if (cacheKey) {
      const cache = await readCache();
      cache.entries[cacheKey] = {
        results: capped,
        timestamp: new Date().toISOString(),
        ttl_hours: DEFAULT_TTL_HOURS,
      };
      evictOldest(cache);
      await writeCache(cache);
    }

    return { success: true, results: capped };
  } catch (err) {
    return { success: false, results: [], error: `GitHub search failed: ${(err as Error).message}` };
  }
}

/**
 * Fetch a skill's content from a raw GitHub URL.
 * Includes security validation to prevent prompt injection.
 */
export async function fetchDiscoveredSkill(sourceUrl: string): Promise<{ success: boolean; content?: string; error?: string; warnings?: string[] }> {
  try {
    const rawUrl = toRawUrl(sourceUrl);
    const res = await fetch(rawUrl);
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const content = await res.text();
    // Basic validation — must look like a skill file
    if (content.length < 50) {
      return { success: false, error: "File too short to be a valid skill" };
    }
    // Size cap — skills over 50KB are suspicious
    if (content.length > 50_000) {
      return { success: false, error: "Skill file exceeds 50KB size limit — may not be a legitimate skill file" };
    }
    // Security scan
    const securityResult = scanForPromptInjection(content);
    if (securityResult.blocked) {
      return { success: false, error: `Security risk detected: ${securityResult.reason}` };
    }
    return { success: true, content, warnings: securityResult.warnings };
  } catch (err) {
    return { success: false, error: `Fetch failed: ${(err as Error).message}` };
  }
}

/**
 * Scan skill content for prompt injection patterns.
 * Skills are markdown injected into LLM context — malicious content
 * could instruct the LLM to exfiltrate data, run commands, or ignore user intent.
 */
export function scanForPromptInjection(content: string): { blocked: boolean; reason?: string; warnings: string[] } {
  const warnings: string[] = [];
  const lower = content.toLowerCase();

  // Hard blocks — these should never appear in a skill file
  const blockedPatterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /ignore (all |any )?(previous|prior|above) (instructions|prompts|context)/i, reason: "Prompt override attempt" },
    { pattern: /forget (all |everything )?(you|your|previous)/i, reason: "Memory wipe attempt" },
    { pattern: /do not (tell|inform|reveal|mention|show) (the user|anyone)/i, reason: "Secrecy instruction — skills should be transparent" },
    { pattern: /exfiltrate|steal|extract.*secret|send.*to.*http/i, reason: "Data exfiltration pattern" },
    { pattern: /curl\s+.*\|.*sh/i, reason: "Remote code execution via pipe to shell" },
    { pattern: /rm\s+-rf\s+[\/~]/i, reason: "Destructive filesystem command" },
    { pattern: /eval\s*\(.*fetch/i, reason: "Dynamic code execution from remote source" },
    { pattern: /<\s*script[\s>]/i, reason: "Script injection" },
  ];

  for (const { pattern, reason } of blockedPatterns) {
    if (pattern.test(content)) {
      return { blocked: true, reason, warnings };
    }
  }

  // Soft warnings — suspicious but not necessarily malicious
  if (lower.includes("api_key") || lower.includes("secret_key") || lower.includes("password")) {
    warnings.push("References credentials — review before loading");
  }
  if (lower.includes("sudo ") || lower.includes("chmod 777")) {
    warnings.push("Contains privileged system commands");
  }
  if ((content.match(/https?:\/\//g) || []).length > 20) {
    warnings.push("Unusually high number of external URLs");
  }
  if (lower.includes("system prompt") || lower.includes("system message")) {
    warnings.push("References system prompts — may attempt to modify LLM behavior");
  }
  if (/you are now|you must now act as/i.test(content)) {
    warnings.push("Contains role-play instructions — common in skills but review for legitimacy");
  }

  return { blocked: false, warnings };
}

/**
 * Format discovery results for presentation to the user via the LLM.
 */
export function formatDiscoveryResults(task: string, results: DiscoveredSkill[]): string {
  if (results.length === 0) {
    return `No skills found in the catalog or on GitHub for: "${task}". Proceeding without methodology.`;
  }

  const lines = [
    `No skill in the local catalog matches "${task}". Found ${results.length} community skill${results.length > 1 ? "s" : ""} on GitHub:`,
    "",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const age = getRelativeAge(r.updated_at);
    lines.push(`${i + 1}. **${r.name}** — ${r.description}`);
    lines.push(`   Source: \`${r.repo}\` · ${r.stars} stars · updated ${age}`);
    lines.push(`   ⚠️ Unverified community skill`);
    lines.push("");
  }

  lines.push("Present these options to the user and ask which they'd like to load.");
  lines.push("Once they pick, call: `superskill({skill_id: \"<source_url>\"})`");

  return lines.join("\n");
}

// ── Internal Helpers ──────────────────────────────────

function extractKeywords(task: string): string[] {
  const stopwords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "not",
    "only", "own", "same", "so", "than", "too", "very", "just", "because",
    "but", "and", "or", "if", "while", "about", "up", "that", "this",
    "it", "its", "my", "me", "i", "we", "our", "you", "your", "help",
    "get", "give", "make", "use", "want", "let", "try", "find", "show",
  ]);

  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

function buildSearchQuery(keywords: string[]): string {
  // Search for SKILL.md files matching keywords
  return `${keywords.join(" ")} filename:SKILL`;
}

async function searchGitHubCode(query: string): Promise<DiscoveredSkill[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "superskill",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 403) return []; // Rate limited, fail gracefully
    throw new Error(`GitHub code search: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    items?: Array<{
      name: string;
      path: string;
      html_url: string;
      repository: {
        full_name: string;
        description: string | null;
        stargazers_count: number;
        updated_at: string;
      };
    }>;
  };

  return (data.items ?? [])
    .filter((item) => item.name.toLowerCase().includes("skill"))
    .map((item) => ({
      name: inferSkillName(item.path, item.repository.full_name),
      description: item.repository.description ?? "No description",
      source_url: item.html_url,
      repo: item.repository.full_name,
      stars: item.repository.stargazers_count,
      updated_at: item.repository.updated_at,
      path: item.path,
    }));
}

async function searchGitHubRepos(keywords: string[]): Promise<DiscoveredSkill[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "superskill",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const query = `${keywords.join(" ")} skill claude in:name,description,readme`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 403) return [];
    throw new Error(`GitHub repo search: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    items?: Array<{
      full_name: string;
      description: string | null;
      stargazers_count: number;
      updated_at: string;
      html_url: string;
    }>;
  };

  return (data.items ?? []).map((repo) => ({
    name: repo.full_name.split("/")[1] ?? repo.full_name,
    description: repo.description ?? "No description",
    source_url: `${repo.html_url}/blob/main/SKILL.md`,
    repo: repo.full_name,
    stars: repo.stargazers_count,
    updated_at: repo.updated_at,
    path: "SKILL.md",
  }));
}

function inferSkillName(path: string, repo: string): string {
  // Try to extract skill name from path like "skills/user-story/SKILL.md"
  const parts = path.split("/");
  if (parts.length >= 2) {
    const dir = parts[parts.length - 2];
    if (dir !== "skills" && dir !== ".agents") {
      return dir.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return repo.split("/")[1]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? repo;
}

function toRawUrl(htmlUrl: string): string {
  // Convert github.com blob URL to raw.githubusercontent.com
  return htmlUrl
    .replace("github.com", "raw.githubusercontent.com")
    .replace("/blob/", "/");
}

function getRelativeAge(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
