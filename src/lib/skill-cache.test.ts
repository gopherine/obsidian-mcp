// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  getCachedSkill,
  cacheSkill,
  isSkillCached,
  listCachedSkills,
  setCacheDir,
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
