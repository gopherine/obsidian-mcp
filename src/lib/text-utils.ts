// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Text processing utilities for keyword extraction and query building.
 * Extracted from web-discovery.ts for reuse in trigger matching.
 */

const STOPWORDS = new Set([
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

/**
 * Extract meaningful keywords from a task description.
 * Strips stopwords and short tokens.
 */
export function extractKeywords(task: string): string[] {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Build a GitHub code search query from keywords.
 */
export function buildSearchQuery(keywords: string[]): string {
  return `${keywords.join(" ")} filename:SKILL`;
}

/**
 * Normalize a task string into a stable cache key.
 * Lowercase, extract keywords, sort alphabetically, join with "+".
 */
export function normalizeCacheKey(task: string): string {
  const kw = extractKeywords(task);
  return kw.sort().join("+");
}
