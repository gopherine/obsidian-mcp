// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Skill cache — local disk cache for fetched skill content.
 * Skills are cached at ~/.superskill/cache/{source}/{name}@{version}.md
 * Prefetched skills are downloaded on install for offline availability.
 */

import { readFile, writeFile, mkdir, rename, readdir } from "fs/promises";
import { resolve, dirname, join } from "path";
import { homedir, tmpdir } from "os";
import { randomBytes } from "crypto";
import { getCatalog } from "../commands/skill/catalog.js";
import type { CatalogSkill } from "../commands/skill/catalog.js";

// ── Configuration ────────────────────────────────────

const CACHE_DIR = resolve(homedir(), ".superskill", "cache");

/** The 8 core skills that are prefetched on install */
export const PREFETCH_SKILL_IDS: string[] = [
  "superpowers/brainstorming",
  "ecc/plan",
  "ecc/tdd-workflow",
  "ecc/go-review",
  "superpowers/systematic-debugging",
  "ecc/security-review",
  "ecc/verification-loop",
  "ecc/deployment-patterns",
];

// Allow tests to override the cache dir
let cacheDir = CACHE_DIR;
export function setCacheDir(dir: string): void { cacheDir = dir; }
export function getCacheDir(): string { return cacheDir; }

// ── Cache Operations ─────────────────────────────────

/**
 * Get cached skill content. Returns null if not cached.
 */
export async function getCachedSkill(skillId: string): Promise<string | null> {
  try {
    const path = skillCachePath(skillId);
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write skill content to cache. Uses atomic write (temp + rename).
 */
export async function cacheSkill(skillId: string, content: string): Promise<void> {
  try {
    const path = skillCachePath(skillId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = join(tmpdir(), `superskill-cache-${randomBytes(8).toString("hex")}`);
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, path);
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Check if a skill is cached.
 */
export async function isSkillCached(skillId: string): Promise<boolean> {
  try {
    await readFile(skillCachePath(skillId), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefetch core skills from their source repos.
 * Called during postinstall. Non-fatal — warns on failure, never blocks install.
 * Returns count of successfully cached skills.
 */
export async function prefetchCoreSkills(options?: {
  concurrency?: number;
  onProgress?: (skill: string, status: "cached" | "fetched" | "failed") => void;
}): Promise<{ fetched: number; cached: number; failed: number; errors: string[] }> {
  const concurrency = options?.concurrency ?? 4;
  const onProgress = options?.onProgress;

  const results = { fetched: 0, cached: 0, failed: 0, errors: [] as string[] };

  // Resolve skill IDs to catalog entries
  const skills = PREFETCH_SKILL_IDS
    .map((id) => getCatalog().find((s) => s.id === id))
    .filter((s): s is CatalogSkill => s !== undefined);

  // Process in batches for bounded concurrency
  for (let i = 0; i < skills.length; i += concurrency) {
    const batch = skills.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (skill) => {
        // Check if already cached
        if (await isSkillCached(skill.id)) {
          onProgress?.(skill.id, "cached");
          results.cached++;
          return;
        }

        // Fetch from source
        const content = await fetchSkillFromSource(skill.source);
        await cacheSkill(skill.id, content);
        onProgress?.(skill.id, "fetched");
        results.fetched++;
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "rejected") {
        const skillId = batch[j].id;
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        results.errors.push(`${skillId}: ${error}`);
        results.failed++;
        onProgress?.(skillId, "failed");
      }
    }
  }

  return results;
}

/**
 * List all cached skills.
 */
export async function listCachedSkills(): Promise<string[]> {
  try {
    const cached: string[] = [];
    const repos = await readdir(cacheDir).catch(() => [] as string[]);
    for (const repo of repos) {
      const repoDir = join(cacheDir, repo);
      const files = await readdir(repoDir).catch(() => [] as string[]);
      for (const file of files) {
        if (file.endsWith(".md")) {
          const name = file.replace(".md", "");
          cached.push(`${repo}/${name}`);
        }
      }
    }
    return cached;
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────

function skillCachePath(skillId: string): string {
  // "ecc/tdd-workflow" → ~/.superskill/cache/ecc/tdd-workflow.md
  const [repo, ...rest] = skillId.split("/");
  const name = rest.join("/");
  return resolve(cacheDir, repo, `${name}.md`);
}

async function fetchSkillFromSource(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(source, "utf-8");
}
