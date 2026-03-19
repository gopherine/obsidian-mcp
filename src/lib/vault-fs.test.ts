import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm, symlink } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { VaultFS, VaultError } from "./vault-fs.js";

describe("VaultFS", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("read", () => {
    it("reads existing file", async () => {
      await writeFile(join(vaultRoot, "test.md"), "content");
      const result = await vaultFs.read("test.md");
      expect(result).toBe("content");
    });

    it("throws FILE_NOT_FOUND for missing file", async () => {
      await expect(vaultFs.read("missing.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("missing.md")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    });

    it("rejects traversal attack with ..", async () => {
      await expect(vaultFs.read("../outside.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("../outside.md")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects absolute path starting with /", async () => {
      await expect(vaultFs.read("/etc/passwd")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("/etc/passwd")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects absolute path starting with ~", async () => {
      await expect(vaultFs.read("~/secret")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("~/secret")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects personal vault segment", async () => {
      await expect(vaultFs.read("personal/notes.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("personal/notes.md")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects personal vault segment case-insensitive", async () => {
      await expect(vaultFs.read("Personal/notes.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("PERSONAL/notes.md")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects non-ASCII characters", async () => {
      await expect(vaultFs.read("test-日本語.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.read("test-日本語.md")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("reads from nested directory", async () => {
      await mkdir(join(vaultRoot, "subdir"), { recursive: true });
      await writeFile(join(vaultRoot, "subdir/nested.md"), "nested content");
      const result = await vaultFs.read("subdir/nested.md");
      expect(result).toBe("nested content");
    });
  });

  describe("write", () => {
    it("creates new file", async () => {
      const result = await vaultFs.write("new.md", "content");
      expect(result.path).toBe("new.md");
      expect(result.bytes).toBe(7);
      const content = await vaultFs.read("new.md");
      expect(content).toBe("content");
    });

    it("creates nested directories", async () => {
      await vaultFs.write("deep/nested/path/file.md", "deep content");
      const content = await vaultFs.read("deep/nested/path/file.md");
      expect(content).toBe("deep content");
    });

    it("overwrites existing file", async () => {
      await vaultFs.write("existing.md", "old");
      await vaultFs.write("existing.md", "new content");
      const content = await vaultFs.read("existing.md");
      expect(content).toBe("new content");
    });

    it("reports correct byte count for UTF-8", async () => {
      const result = await vaultFs.write("utf8.md", "hello");
      expect(result.bytes).toBe(5);
    });
  });

  describe("append", () => {
    it("appends to existing file", async () => {
      await vaultFs.write("append.md", "line1\n");
      const result = await vaultFs.append("append.md", "line2\n");
      expect(result.bytes).toBe(6);
      const content = await vaultFs.read("append.md");
      expect(content).toBe("line1\nline2\n");
    });

    it("throws FILE_NOT_FOUND when appending to missing file", async () => {
      await expect(vaultFs.append("missing.md", "content")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await vaultFs.write("file1.md", "1");
      await vaultFs.write("file2.md", "2");
      await vaultFs.write("subdir/file3.md", "3");
      await vaultFs.write("subdir/deep/file4.md", "4");
      await writeFile(join(vaultRoot, ".hidden"), "hidden");
    });

    it("lists files at depth 1", async () => {
      const result = await vaultFs.list(".", 1);
      expect(result).toContain("./file1.md");
      expect(result).toContain("./file2.md");
      expect(result).toContain("./subdir/");
      expect(result).not.toContain("./subdir/file3.md");
    });

    it("lists files at depth 2", async () => {
      const result = await vaultFs.list(".", 2);
      expect(result).toContain("./file1.md");
      expect(result).toContain("./subdir/file3.md");
      expect(result).toContain("./subdir/deep/");
      expect(result).not.toContain("./subdir/deep/file4.md");
    });

    it("excludes hidden files", async () => {
      const result = await vaultFs.list(".", 1);
      expect(result).not.toContain(".hidden");
    });

    it("excludes .obsidian directory", async () => {
      await mkdir(join(vaultRoot, ".obsidian"));
      await writeFile(join(vaultRoot, ".obsidian/config"), "config");
      const result = await vaultFs.list(".", 2);
      expect(result.some(p => p.includes(".obsidian"))).toBe(false);
    });

    it("skips symlinks", async () => {
      await symlink(join(vaultRoot, "file1.md"), join(vaultRoot, "link.md"));
      const result = await vaultFs.list(".", 1);
      expect(result).toContain("./file1.md");
      expect(result).not.toContain("./link.md");
    });

    it("throws FILE_NOT_FOUND for missing directory", async () => {
      await expect(vaultFs.list("missing-dir", 1)).rejects.toThrow(VaultError);
      await expect(vaultFs.list("missing-dir", 1)).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    });
  });

  describe("delete", () => {
    it("deletes existing file", async () => {
      await vaultFs.write("to-delete.md", "content");
      await vaultFs.delete("to-delete.md");
      expect(await vaultFs.exists("to-delete.md")).toBe(false);
    });

    it("throws FILE_NOT_FOUND for missing file", async () => {
      await expect(vaultFs.delete("missing.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.delete("missing.md")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    });
  });

  describe("move", () => {
    it("moves existing file", async () => {
      await vaultFs.write("old.md", "content");
      const result = await vaultFs.move("old.md", "new.md");
      expect(result.from).toBe("old.md");
      expect(result.to).toBe("new.md");
      expect(await vaultFs.exists("old.md")).toBe(false);
      const content = await vaultFs.read("new.md");
      expect(content).toBe("content");
    });

    it("moves to nested path creating directories", async () => {
      await vaultFs.write("move-me.md", "content");
      await vaultFs.move("move-me.md", "deep/nested/moved.md");
      expect(await vaultFs.exists("move-me.md")).toBe(false);
      const content = await vaultFs.read("deep/nested/moved.md");
      expect(content).toBe("content");
    });

    it("throws FILE_NOT_FOUND for missing source", async () => {
      await expect(vaultFs.move("missing.md", "target.md")).rejects.toThrow(VaultError);
      await expect(vaultFs.move("missing.md", "target.md")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    });
  });

  describe("exists", () => {
    it("returns true for existing file", async () => {
      await vaultFs.write("exists.md", "content");
      expect(await vaultFs.exists("exists.md")).toBe(true);
    });

    it("returns false for missing file", async () => {
      expect(await vaultFs.exists("missing.md")).toBe(false);
    });

    it("returns true for directory", async () => {
      await mkdir(join(vaultRoot, "mydir"));
      expect(await vaultFs.exists("mydir")).toBe(true);
    });
  });

  describe("verifyNoSymlinkEscape", () => {
    it("allows regular file", async () => {
      await writeFile(join(vaultRoot, "regular.md"), "content");
      await expect(vaultFs.verifyNoSymlinkEscape("regular.md")).resolves.toBeUndefined();
    });

    it("allows symlink inside vault", async () => {
      await writeFile(join(vaultRoot, "target.md"), "content");
      await symlink(join(vaultRoot, "target.md"), join(vaultRoot, "link.md"));
      await expect(vaultFs.verifyNoSymlinkEscape("link.md")).resolves.toBeUndefined();
    });

    it("rejects symlink escaping vault", async () => {
      const outsideDir = join(homedir(), `.outside-${Date.now()}`);
      await mkdir(outsideDir, { recursive: true });
      await writeFile(join(outsideDir, "outside.md"), "outside");
      await symlink(join(outsideDir, "outside.md"), join(vaultRoot, "escape.md"));
      
      try {
        await vaultFs.read("escape.md");
        expect.fail("Should have thrown");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(VaultError);
        expect((e as VaultError).code).toBe("PERMISSION_DENIED");
      }
      
      await rm(outsideDir, { recursive: true, force: true });
    });
  });
});
