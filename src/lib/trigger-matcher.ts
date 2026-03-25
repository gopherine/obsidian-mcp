// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Trigger-based skill matching — scores tasks against registry trigger keywords.
 * Replaces the hardcoded TASK_DOMAIN_MAP regex approach.
 *
 * Scoring algorithm:
 * 1. Tokenize task → keywords
 * 2. Score each domain by trigger keyword overlap
 * 3. Score each skill within qualifying domains
 * 4. Return ranked results
 */

import { extractKeywords } from "./text-utils.js";
import type { RegistryData, RegistryDomain, RegistrySkill } from "./registry-loader.js";

// ── Types ──────────────────────────────────────────

export interface DomainMatch {
  domain: RegistryDomain;
  score: number;
}

export interface SkillMatch {
  skill: RegistrySkill;
  domain_id: string;
  score: number;
}

export interface MatchResult {
  domains: DomainMatch[];
  skills: SkillMatch[];
}

// ── Stemming ───────────────────────────────────────

/**
 * Lightweight suffix stripping for matching.
 * Handles common English plurals and verb forms.
 * Not a full stemmer — just enough for trigger matching.
 */
export function simpleStem(word: string): string {
  if (word.length <= 3) return word;
  // -ing → remove (e.g. "testing" → "test")
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  // -tion → remove (e.g. "migration" → "migra") — skip, too lossy
  // -ies → y (e.g. "queries" → "query") — skip, too specific
  // -es → remove (e.g. "fixes" → "fix")
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  // -s → remove (e.g. "tests" → "test")
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// ── Scoring ────────────────────────────────────────

/**
 * Check if a word matches a trigger word, considering stems.
 */
function wordMatches(taskWord: string, triggerWord: string): boolean {
  if (taskWord === triggerWord) return true;
  // Check stemmed forms
  return simpleStem(taskWord) === simpleStem(triggerWord);
}

/**
 * Score how well a set of task keywords matches a trigger list.
 *
 * - Exact word match: 1.0
 * - Phrase match (all trigger words appear in task): 2.0
 * - Partial phrase match: 0.5 * (overlap / total trigger words)
 */
export function scoreTriggers(taskKeywords: string[], triggers: string[]): number {
  if (taskKeywords.length === 0 || triggers.length === 0) return 0;

  let score = 0;

  for (const trigger of triggers) {
    const triggerWords = trigger.toLowerCase().split(/\s+/);

    if (triggerWords.length === 1) {
      // Single-word trigger: match against task keywords (with stemming)
      if (taskKeywords.some((kw) => wordMatches(kw, triggerWords[0]))) {
        score += 1.0;
      }
    } else {
      // Multi-word trigger: check how many trigger words appear in task
      const matches = triggerWords.filter((tw) =>
        taskKeywords.some((kw) => wordMatches(kw, tw))
      );
      if (matches.length === triggerWords.length) {
        // Full phrase match — high confidence
        score += 2.0;
      } else if (matches.length > 0) {
        // Partial match — proportional score
        score += 0.5 * (matches.length / triggerWords.length);
      }
    }
  }

  return score;
}

// ── Domain Matching ────────────────────────────────

const DOMAIN_THRESHOLD = 0.5;

/**
 * Score all domains against a task description.
 * Returns domains that meet the threshold, sorted by score descending.
 */
export function scoreDomains(task: string, registry: RegistryData): DomainMatch[] {
  const keywords = extractKeywords(task);
  if (keywords.length === 0) return [];

  const matches: DomainMatch[] = [];

  for (const domain of registry.domains) {
    const score = scoreTriggers(keywords, domain.triggers);
    if (score >= DOMAIN_THRESHOLD) {
      matches.push({ domain, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Score skills within a specific domain against a task description.
 * Returns skills sorted by score descending.
 */
export function scoreSkills(
  task: string,
  domainId: string,
  registry: RegistryData,
): SkillMatch[] {
  const keywords = extractKeywords(task);
  if (keywords.length === 0) return [];

  const matches: SkillMatch[] = [];

  for (const skill of registry.skills) {
    if (!skill.domains.includes(domainId)) continue;
    const score = scoreTriggers(keywords, skill.triggers);
    matches.push({ skill, domain_id: domainId, score });
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Match a task to domains and skills using trigger-based scoring.
 * This is the main entry point that replaces matchTaskToDomains().
 *
 * Returns matched domain IDs (for backward compatibility with activate.ts).
 */
export function matchTask(task: string, registry: RegistryData): string[] {
  const domainMatches = scoreDomains(task, registry);
  return domainMatches.map((m) => m.domain.id);
}
