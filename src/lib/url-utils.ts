// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * URL and path utilities for GitHub skill content.
 * Extracted from web-discovery.ts for reuse.
 */

/**
 * Convert a github.com blob URL to raw.githubusercontent.com.
 */
export function toRawUrl(htmlUrl: string): string {
  return htmlUrl
    .replace("github.com", "raw.githubusercontent.com")
    .replace("/blob/", "/");
}

/**
 * Extract a human-readable skill name from a GitHub file path.
 * e.g. "skills/user-story/SKILL.md" → "User Story"
 */
export function inferSkillName(path: string, repo: string): string {
  const parts = path.split("/");
  if (parts.length >= 2) {
    const dir = parts[parts.length - 2];
    if (dir !== "skills" && dir !== ".agents") {
      return dir.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return repo.split("/")[1]?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? repo;
}

/**
 * Format a date string as a human-readable relative age.
 */
export function getRelativeAge(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
