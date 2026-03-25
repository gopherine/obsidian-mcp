// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Skill cache — local disk cache for fetched skill content.
 * Skills are cached at ~/.superskill/cache/{source}/{name}@{version}.md
 * Prefetched skills are downloaded on install for offline availability.
 */

import { readFile, writeFile, mkdir, rename, readdir, unlink, stat } from "fs/promises";
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

/** Maximum total cache size before LRU eviction kicks in */
const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Allow tests to override the cache dir
let cacheDir = CACHE_DIR;
export function setCacheDir(dir: string): void { cacheDir = dir; }
export function getCacheDir(): string { return cacheDir; }

// ── Cache Operations ─────────────────────────────────

/**
 * Get cached skill content. Returns null if not cached.
 */
export async function getCachedSkill(skillId: string, version?: string): Promise<string | null> {
  try {
    const path = skillCachePath(skillId, version);
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write skill content to cache. Uses atomic write (temp + rename).
 * Triggers LRU eviction when total cache size exceeds MAX_CACHE_SIZE_BYTES.
 */
export async function cacheSkill(skillId: string, content: string, version?: string): Promise<void> {
  let tmp: string | undefined;
  try {
    const path = skillCachePath(skillId, version);
    await mkdir(dirname(path), { recursive: true });
    tmp = join(tmpdir(), `superskill-cache-${randomBytes(8).toString("hex")}`);
    await writeFile(tmp, content, "utf-8");
    await rename(tmp, path);
    tmp = undefined; // rename succeeded — no cleanup needed
    // Evict stale entries if cache has grown too large
    await evictLRU();
  } catch (e) {
    console.error(`[cache] write failed for ${skillId}: ${(e as Error).message}`);
    // Clean up orphaned temp file
    if (tmp) { try { await unlink(tmp); } catch { /* best effort */ } }
  }
}

/**
 * Check if a skill is cached.
 */
export async function isSkillCached(skillId: string, version?: string): Promise<boolean> {
  try {
    await readFile(skillCachePath(skillId, version), "utf-8");
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

// ── Eviction & Invalidation ─────────────────────────

/**
 * Evict oldest cached files (by mtime) until total size is under
 * MAX_CACHE_SIZE_BYTES. Core prefetch skills are exempt from eviction.
 * Returns the number of evicted entries.
 */
export async function evictLRU(): Promise<number> {
  // Collect all cached files with stats
  interface CacheEntry { path: string; skillId: string; size: number; mtimeMs: number }
  const entries: CacheEntry[] = [];

  const repos = await readdir(cacheDir).catch(() => [] as string[]);
  for (const repo of repos) {
    const repoDir = join(cacheDir, repo);
    const files = await readdir(repoDir).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(repoDir, file);
      try {
        const st = await stat(filePath);
        // Derive skillId (strip version tag and .md for comparison)
        const base = file.replace(".md", "").replace(/@[^@]+$/, "");
        entries.push({ path: filePath, skillId: `${repo}/${base}`, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        // stat failed — skip
      }
    }
  }

  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  if (totalSize <= MAX_CACHE_SIZE_BYTES) return 0;

  // Sort oldest-modified first (mtime is reliable across all platforms, unlike atime)
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const coreSet = new Set(PREFETCH_SKILL_IDS);
  let currentSize = totalSize;
  let evicted = 0;

  for (const entry of entries) {
    if (currentSize <= MAX_CACHE_SIZE_BYTES) break;
    // Never evict core prefetch skills
    if (coreSet.has(entry.skillId)) continue;
    try {
      await unlink(entry.path);
      currentSize -= entry.size;
      evicted++;
    } catch {
      // Already gone — ignore
    }
  }

  return evicted;
}

/**
 * Remove a specific versioned cache entry (e.g. when the registry reports a
 * newer version). Returns true if a file was actually deleted.
 */
export async function invalidateVersion(skillId: string, oldVersion: string): Promise<boolean> {
  try {
    const path = skillCachePath(skillId, oldVersion);
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────

function skillCachePath(skillId: string, version?: string): string {
  const [repo, ...rest] = skillId.split("/");
  const name = rest.join("/");
  const suffix = version ? `${name}@${version}.md` : `${name}.md`;
  return resolve(cacheDir, repo, suffix);
}

async function fetchSkillFromSource(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(source, "utf-8");
}
