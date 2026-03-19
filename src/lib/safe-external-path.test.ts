import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, symlink } from "fs/promises";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { safeExternalPath } from "./safe-external-path.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

describe("safeExternalPath", () => {
  let testDir: string;
  const home = homedir();

  beforeEach(async () => {
    testDir = join(tmpdir(), `safe-path-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    
    await execFileAsync("git", ["init"], { cwd: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("valid paths", () => {
    it("accepts path under home directory", async () => {
      const homeTestDir = join(home, `.safe-path-test-${Date.now()}`);
      await mkdir(homeTestDir, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: homeTestDir });

      const result = await safeExternalPath(homeTestDir);
      expect(result).toBe(homeTestDir);

      await rm(homeTestDir, { recursive: true, force: true });
    });

    it("accepts path with ~ prefix", async () => {
      const homeTestDir = join(home, `.safe-path-test-tilde-${Date.now()}`);
      await mkdir(homeTestDir, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: homeTestDir });

      const result = await safeExternalPath(homeTestDir.replace(home, "~"));
      expect(result).toBe(homeTestDir);

      await rm(homeTestDir, { recursive: true, force: true });
    });

    it("resolves relative path segments", async () => {
      const homeTestDir = join(home, `.safe-path-test-rel-${Date.now()}`);
      await mkdir(homeTestDir, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: homeTestDir });

      const result = await safeExternalPath(`${homeTestDir}/./subdir/..`);
      expect(result).toBe(homeTestDir);

      await rm(homeTestDir, { recursive: true, force: true });
    });
  });

  describe("traversal attack prevention", () => {
    it("rejects path with .. traversal", async () => {
      await expect(safeExternalPath("/Users/../../../etc/passwd")).rejects.toThrow("Path must be under home directory");
    });
  });

  describe("symlink escape prevention", () => {
    it("rejects symlink escaping home directory", async () => {
      const outsideDir = join(tmpdir(), `outside-safe-${Date.now()}`);
      await mkdir(outsideDir, { recursive: true });
      
      const linkPath = join(testDir, "escape-link");
      
      try {
        await symlink(outsideDir, linkPath);
        await expect(safeExternalPath(linkPath)).rejects.toThrow();
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });

    it("accepts symlink within home directory", async () => {
      const homeTestDir = join(home, `.safe-path-test-link-${Date.now()}`);
      await mkdir(homeTestDir, { recursive: true });
      await execFileAsync("git", ["init"], { cwd: homeTestDir });
      
      const linkPath = join(home, `.safe-path-link-${Date.now()}`);
      await symlink(homeTestDir, linkPath);

      const result = await safeExternalPath(linkPath);
      expect(result).toBeDefined();

      await rm(linkPath, { force: true });
      await rm(homeTestDir, { recursive: true, force: true });
    });
  });

  describe("non-home directory rejection", () => {
    it("rejects path outside home directory", async () => {
      await expect(safeExternalPath("/etc/passwd")).rejects.toThrow("Path must be under home directory");
    });

    it("rejects /tmp directly (outside home)", async () => {
      await expect(safeExternalPath("/tmp")).rejects.toThrow("Path must be under home directory");
    });
  });

  describe("git repository check", () => {
    it("rejects non-git directory", async () => {
      const homeNonGit = join(home, `.safe-path-non-git-${Date.now()}`);
      await mkdir(homeNonGit, { recursive: true });

      await expect(safeExternalPath(homeNonGit)).rejects.toThrow("Not a git repository");

      await rm(homeNonGit, { recursive: true, force: true });
    });
  });

  describe("nonexistent path handling", () => {
    it("rejects nonexistent path", async () => {
      const nonexistent = join(home, `.nonexistent-path-${Date.now()}`);
      await expect(safeExternalPath(nonexistent)).rejects.toThrow("Path does not exist");
    });
  });
});
