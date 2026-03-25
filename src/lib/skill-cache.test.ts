// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, writeFile, mkdir, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  getCachedSkill,
  cacheSkill,
  isSkillCached,
  listCachedSkills,
  setCacheDir,
  evictLRU,
  invalidateVersion,
  PREFETCH_SKILL_IDS,
} from "./skill-cache.js";

describe("skill-cache", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "superskill-cache-test-"));
    setCacheDir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("cacheSkill / getCachedSkill", () => {
    it("writes and reads a cached skill", async () => {
      const content = "# TDD Workflow\n\nWrite tests first.";
      await cacheSkill("ecc/tdd-workflow", content);

      const cached = await getCachedSkill("ecc/tdd-workflow");
      expect(cached).toBe(content);
    });

    it("returns null for uncached skill", async () => {
      const cached = await getCachedSkill("ecc/nonexistent");
      expect(cached).toBeNull();
    });

    it("creates nested directories for repo/skill structure", async () => {
      await cacheSkill("superpowers/brainstorming", "# Brainstorming");
      const files = await readdir(join(tempDir, "superpowers"));
      expect(files).toContain("brainstorming.md");
    });

    it("overwrites existing cache entry", async () => {
      await cacheSkill("ecc/plan", "v1");
      await cacheSkill("ecc/plan", "v2");
      const cached = await getCachedSkill("ecc/plan");
      expect(cached).toBe("v2");
    });
  });

  describe("isSkillCached", () => {
    it("returns false for uncached skill", async () => {
      expect(await isSkillCached("ecc/missing")).toBe(false);
    });

    it("returns true for cached skill", async () => {
      await cacheSkill("ecc/tdd-workflow", "content");
      expect(await isSkillCached("ecc/tdd-workflow")).toBe(true);
    });
  });

  describe("listCachedSkills", () => {
    it("returns empty array when nothing cached", async () => {
      expect(await listCachedSkills()).toEqual([]);
    });

    it("lists all cached skills", async () => {
      await cacheSkill("ecc/tdd-workflow", "a");
      await cacheSkill("ecc/plan", "b");
      await cacheSkill("superpowers/brainstorming", "c");

      const list = await listCachedSkills();
      expect(list).toHaveLength(3);
      expect(list).toContain("ecc/tdd-workflow");
      expect(list).toContain("ecc/plan");
      expect(list).toContain("superpowers/brainstorming");
    });
  });

  describe("version-pinned cache paths", () => {
    it("caches and retrieves a versioned skill", async () => {
      await cacheSkill("ecc/plan", "v1 content", "1.0.0");
      const cached = await getCachedSkill("ecc/plan", "1.0.0");
      expect(cached).toBe("v1 content");
    });

    it("versioned and unversioned entries are independent", async () => {
      await cacheSkill("ecc/plan", "unversioned");
      await cacheSkill("ecc/plan", "versioned", "2.0.0");

      expect(await getCachedSkill("ecc/plan")).toBe("unversioned");
      expect(await getCachedSkill("ecc/plan", "2.0.0")).toBe("versioned");
    });

    it("creates versioned filename on disk", async () => {
      await cacheSkill("ecc/tdd-workflow", "content", "3.1.0");
      const files = await readdir(join(tempDir, "ecc"));
      expect(files).toContain("tdd-workflow@3.1.0.md");
    });

    it("isSkillCached respects version parameter", async () => {
      await cacheSkill("ecc/plan", "content", "1.0.0");
      expect(await isSkillCached("ecc/plan", "1.0.0")).toBe(true);
      expect(await isSkillCached("ecc/plan", "2.0.0")).toBe(false);
      expect(await isSkillCached("ecc/plan")).toBe(false);
    });
  });

  describe("invalidateVersion", () => {
    it("removes a specific versioned cache entry", async () => {
      await cacheSkill("ecc/plan", "old", "1.0.0");
      expect(await invalidateVersion("ecc/plan", "1.0.0")).toBe(true);
      expect(await getCachedSkill("ecc/plan", "1.0.0")).toBeNull();
    });

    it("returns false when entry does not exist", async () => {
      expect(await invalidateVersion("ecc/plan", "9.9.9")).toBe(false);
    });

    it("does not affect other versions", async () => {
      await cacheSkill("ecc/plan", "v1", "1.0.0");
      await cacheSkill("ecc/plan", "v2", "2.0.0");
      await invalidateVersion("ecc/plan", "1.0.0");
      expect(await getCachedSkill("ecc/plan", "2.0.0")).toBe("v2");
    });
  });

  describe("evictLRU", () => {
    it("does nothing when cache is under 5 MB", async () => {
      await cacheSkill("ecc/plan", "small", "1.0.0");
      const evicted = await evictLRU();
      expect(evicted).toBe(0);
    });

    it("evicts oldest non-core files when cache exceeds 5 MB", async () => {
      // Create files totalling > 5 MB
      const chunk = "x".repeat(1024 * 1024); // 1 MB each
      const repoDir = join(tempDir, "vendor");
      await mkdir(repoDir, { recursive: true });

      // Write 6 x 1 MB files with staggered mtime
      for (let i = 0; i < 6; i++) {
        const filePath = join(repoDir, `skill-${i}@1.0.0.md`);
        await writeFile(filePath, chunk, "utf-8");
        // Set mtime so skill-0 is oldest
        const mtime = new Date(Date.now() - (6 - i) * 60_000);
        await utimes(filePath, mtime, mtime);
      }

      const evicted = await evictLRU();
      expect(evicted).toBeGreaterThan(0);

      // Newest files should survive
      const remaining = await readdir(repoDir);
      expect(remaining.length).toBeLessThan(6);
      // The oldest file (skill-0) should have been evicted first
      expect(remaining).not.toContain("skill-0@1.0.0.md");
    });

    it("never evicts core prefetch skills", async () => {
      const chunk = "x".repeat(1024 * 1024);
      // Write a core skill as a large file
      const coreId = PREFETCH_SKILL_IDS[0]; // superpowers/brainstorming
      await cacheSkill(coreId, chunk);

      // Fill the rest with non-core skills to exceed 5 MB
      const repoDir = join(tempDir, "vendor");
      await mkdir(repoDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        const filePath = join(repoDir, `filler-${i}@1.0.0.md`);
        await writeFile(filePath, chunk, "utf-8");
        const mtime = new Date(Date.now() - (5 - i) * 60_000);
        await utimes(filePath, mtime, mtime);
      }

      await evictLRU();

      // Core skill must still exist
      expect(await isSkillCached(coreId)).toBe(true);
    });
  });

  describe("PREFETCH_SKILL_IDS", () => {
    it("contains exactly 8 core skills", () => {
      expect(PREFETCH_SKILL_IDS).toHaveLength(8);
    });

    it("all prefetch IDs exist in a valid format", () => {
      for (const id of PREFETCH_SKILL_IDS) {
        expect(id).toMatch(/^[a-z-]+\/[a-z-]+$/);
      }
    });
  });
});
