// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * GitHub Search API client for discovering SKILL.md files.
 * Extracted from web-discovery.ts for reuse and testability.
 */

import { inferSkillName } from "./url-utils.js";

export interface DiscoveredSkill {
  name: string;
  description: string;
  source_url: string;
  repo: string;
  stars: number;
  updated_at: string;
  path: string;
}

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "superskill",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Search GitHub code for SKILL.md files matching a query.
 * Returns empty array on rate limit (403).
 */
export async function searchGitHubCode(query: string): Promise<DiscoveredSkill[]> {
  const headers = getGitHubHeaders();
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

/**
 * Search GitHub repositories for skill-related repos.
 * Returns empty array on rate limit (403).
 */
export async function searchGitHubRepos(keywords: string[]): Promise<DiscoveredSkill[]> {
  const headers = getGitHubHeaders();
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
