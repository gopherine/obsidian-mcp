import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { detectProject, invalidateProjectMapCache } from "./project-detector.js";

describe("project-detector", () => {
  let vaultRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    vaultRoot = join(tmpdir(), `project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    originalCwd = process.cwd();
    invalidateProjectMapCache();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(vaultRoot, { recursive: true, force: true });
    invalidateProjectMapCache();
  });

  describe("detectProject", () => {
    it("returns null when no project-map.json", async () => {
      const result = await detectProject("/nonexistent/path", vaultRoot);
      expect(result).toBeNull();
    });

    it("detects project from exact cwd match in project-map.json", async () => {
      const projectMap = { "/Users/test/myproject": "myproject" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/myproject", vaultRoot);
      expect(result).toBe("myproject");
    });

    it("detects project from subdirectory of mapped path", async () => {
      const projectMap = { "/Users/test/myproject": "myproject" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/myproject/src/components", vaultRoot);
      expect(result).toBe("myproject");
    });

    it("returns null for unmapped path", async () => {
      const projectMap = { "/Users/test/other": "other" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/unmapped", vaultRoot);
      expect(result).toBeNull();
    });

    it("handles invalid JSON in project-map.json", async () => {
      await writeFile(join(vaultRoot, "project-map.json"), "not valid json {{{");
      invalidateProjectMapCache();

      const result = await detectProject("/any/path", vaultRoot);
      expect(result).toBeNull();
    });

    it("handles non-object project-map.json", async () => {
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(["array", "not", "object"]));
      invalidateProjectMapCache();

      const result = await detectProject("/any/path", vaultRoot);
      expect(result).toBeNull();
    });

    it("strips .worktrees suffix from cwd", async () => {
      const projectMap = { "/Users/test/myproject": "myproject" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/myproject/.worktrees/feat-x", vaultRoot);
      expect(result).toBe("myproject");
    });

    it("strips .claude/worktrees suffix from cwd", async () => {
      const projectMap = { "/Users/test/myproject": "myproject" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/myproject/.claude/worktrees/feat/name", vaultRoot);
      expect(result).toBe("myproject");
    });

    it("strips .claude-worktrees suffix from cwd", async () => {
      const projectMap = { "/Users/test/myproject": "myproject" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const result = await detectProject("/Users/test/myproject/.claude-worktrees/feat-name", vaultRoot);
      expect(result).toBe("myproject");
    });

    it("ignores non-string values in project-map.json", async () => {
      const projectMap = { 
        "/Users/test/good": "good",
        "/Users/test/bad": 123,
        "/Users/test/also-bad": null 
      };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      const goodResult = await detectProject("/Users/test/good", vaultRoot);
      expect(goodResult).toBe("good");

      const badResult = await detectProject("/Users/test/bad", vaultRoot);
      expect(badResult).toBeNull();
    });

    it("caches project-map.json", async () => {
      const projectMap = { "/Users/test/cached": "cached" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap));
      invalidateProjectMapCache();

      await detectProject("/Users/test/cached", vaultRoot);
      
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify({ "/Users/test/other": "other" }));

      const result = await detectProject("/Users/test/cached", vaultRoot);
      expect(result).toBe("cached");
    });

    it("cache invalidates for different vault path", async () => {
      const projectMap1 = { "/Users/test/path1": "project1" };
      await writeFile(join(vaultRoot, "project-map.json"), JSON.stringify(projectMap1));
      invalidateProjectMapCache();

      const vaultRoot2 = join(tmpdir(), `project-test-2-${Date.now()}`);
      await mkdir(vaultRoot2, { recursive: true });
      const projectMap2 = { "/Users/test/path1": "project2" };
      await writeFile(join(vaultRoot2, "project-map.json"), JSON.stringify(projectMap2));

      const result1 = await detectProject("/Users/test/path1", vaultRoot);
      const result2 = await detectProject("/Users/test/path1", vaultRoot2);

      expect(result1).toBe("project1");
      expect(result2).toBe("project2");

      await rm(vaultRoot2, { recursive: true, force: true });
    });
  });
});
