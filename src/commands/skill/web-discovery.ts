// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web Discovery — search GitHub for skills not in the local catalog.
 * Called as a fallback when activateSkills() finds zero matches.
 *
 * Delegates to focused modules:
 * - github-client.ts — GitHub Search API
 * - security-scanner.ts — prompt injection detection
 * - text-utils.ts — keyword extraction
 * - url-utils.ts — URL conversion, relative age formatting
 */

import { homedir } from "os";
import { join } from "path";
import { readFile, writeFile, rename, mkdir } from "fs/promises";
import { searchGitHubCode, searchGitHubRepos } from "../../lib/github-client.js";
import { scanForPromptInjection } from "../../lib/security-scanner.js";
import { extractKeywords, buildSearchQuery, normalizeCacheKey } from "../../lib/text-utils.js";
import { toRawUrl, getRelativeAge } from "../../lib/url-utils.js";

// Re-export for backward compatibility
export { scanForPromptInjection } from "../../lib/security-scanner.js";
export { normalizeCacheKey } from "../../lib/text-utils.js";

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
 * Results are cached for 24 hours to avoid hitting GitHub API rate limits.
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
    if (content.length < 50) {
      return { success: false, error: "File too short to be a valid skill" };
    }
    if (content.length > 50_000) {
      return { success: false, error: "Skill file exceeds 50KB size limit — may not be a legitimate skill file" };
    }
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
