// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Session-aware skill memory — remembers activated skills within a session
 * to avoid redundant fetches for the same or similar tasks.
 */

import { normalizeCacheKey } from "./text-utils.js";

export interface SessionEntry {
  task: string;
  domains: string[];
  skill_ids: string[];
  timestamp: number;
}

/**
 * In-process skill session memory.
 * Tracks activated skills by normalized task key so repeat calls
 * with the same intent return cached results.
 */
export class SkillSession {
  private entries = new Map<string, SessionEntry>();

  /**
   * Remember a skill activation result.
   */
  remember(task: string, domains: string[], skillIds: string[]): void {
    const key = normalizeCacheKey(task);
    if (!key) return;
    this.entries.set(key, {
      task,
      domains,
      skill_ids: skillIds,
      timestamp: Date.now(),
    });
  }

  /**
   * Recall a previous activation for a similar task.
   * Returns null if no matching entry exists.
   */
  recall(task: string): SessionEntry | null {
    const key = normalizeCacheKey(task);
    if (!key) return null;
    return this.entries.get(key) ?? null;
  }

  /**
   * Check if a task has been activated before.
   */
  has(task: string): boolean {
    const key = normalizeCacheKey(task);
    if (!key) return false;
    return this.entries.has(key);
  }

  /**
   * Clear all session memory.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get the number of remembered activations.
   */
  get size(): number {
    return this.entries.size;
  }
}

/** Global session instance — persists for the process lifetime. */
export const globalSkillSession = new SkillSession();
