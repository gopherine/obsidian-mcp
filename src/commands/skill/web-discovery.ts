// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial

/**
 * Web Discovery — search GitHub for skills not in the local catalog.
 * Called as a fallback when activateSkills() finds zero matches.
 */

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

/**
 * Search GitHub for SKILL.md files matching a task description.
 * Uses the GitHub Search API (code search + repo search).
 * Unauthenticated: 10 req/min. With GITHUB_TOKEN: 30 req/min.
 */
export async function searchGitHubForSkills(task: string): Promise<WebDiscoveryResult> {
  const keywords = extractKeywords(task);
  if (keywords.length === 0) {
    return { success: false, results: [], error: "Could not extract search keywords from task" };
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
    return { success: true, results: skills.slice(0, 5) };
  } catch (err) {
    return { success: false, results: [], error: `GitHub search failed: ${(err as Error).message}` };
  }
}

/**
 * Fetch a skill's content from a raw GitHub URL.
 */
export async function fetchDiscoveredSkill(sourceUrl: string): Promise<{ success: boolean; content?: string; error?: string }> {
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
    return { success: true, content };
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
  // Combine keywords with SKILL.md to find skill files
  return `${keywords.join(" ")} SKILL.md language:markdown`;
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

  const query = `${keywords.join(" ")} skill claude-code topic:mcp-skill OR topic:claude-code-skill OR topic:ai-skill`;
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
