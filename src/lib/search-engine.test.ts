import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { searchText, searchStructured } from "./search-engine.js";

describe("search-engine", () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = join(tmpdir(), `search-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("searchText", () => {
    beforeEach(async () => {
      await writeFile(join(vaultRoot, "doc1.md"), "# Hello World\n\nThis is a test document.");
      await writeFile(join(vaultRoot, "doc2.md"), "# Another Doc\n\nNo matching content here.");
      await mkdir(join(vaultRoot, "subdir"), { recursive: true });
      await writeFile(join(vaultRoot, "subdir/nested.md"), "# Nested Hello\n\nHello from nested path.");
      await mkdir(join(vaultRoot, ".obsidian"), { recursive: true });
      await writeFile(join(vaultRoot, ".obsidian/config"), "hello in hidden");
    });

    it("finds matching documents", async () => {
      const results = await searchText(vaultRoot, "Hello");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.path === "doc1.md")).toBe(true);
    });

    it("is case insensitive", async () => {
      const results = await searchText(vaultRoot, "HELLO");
      expect(results.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", async () => {
      const results = await searchText(vaultRoot, "Hello", { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("filters by path", async () => {
      const results = await searchText(vaultRoot, "Hello", { pathFilter: "subdir" });
      expect(results.every(r => r.path.startsWith("subdir"))).toBe(true);
    });

    it("excludes hidden directories", async () => {
      const results = await searchText(vaultRoot, "hello");
      expect(results.every(r => !r.path.startsWith(".obsidian"))).toBe(true);
    });

    it("returns empty array for no matches", async () => {
      const results = await searchText(vaultRoot, "zzzznomatchxxxx");
      expect(results).toEqual([]);
    });

    it("rejects traversal attack in pathFilter", async () => {
      await expect(searchText(vaultRoot, "test", { pathFilter: "../outside" })).rejects.toThrow();
    });

    it("rejects absolute path in pathFilter", async () => {
      await expect(searchText(vaultRoot, "test", { pathFilter: "/etc/passwd" })).rejects.toThrow();
    });

    it("returns path, snippet, and line number", async () => {
      const results = await searchText(vaultRoot, "World");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBeDefined();
      expect(results[0].snippet).toBeDefined();
      expect(results[0].line).toBeGreaterThan(0);
    });

    it("handles special regex characters safely", async () => {
      await writeFile(join(vaultRoot, "special.md"), "Content with $pecial ch@rs");
      const results = await searchText(vaultRoot, "$pecial");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("searchStructured", () => {
    beforeEach(async () => {
      await writeFile(
        join(vaultRoot, "task1.md"),
        "---\ntype: task\nstatus: in-progress\nproject: test-project\ntags:\n  - urgent\n  - backend\n---\n\n# Task 1\n\nTask one content."
      );
      await writeFile(
        join(vaultRoot, "task2.md"),
        "---\ntype: task\nstatus: done\nproject: other-project\ntags:\n  - frontend\n---\n\n# Task 2\n\nTask two content."
      );
      await writeFile(
        join(vaultRoot, "note.md"),
        "---\ntype: index\n---\n\n# Note\n\nJust a note."
      );
    });

    it("filters by single frontmatter field", async () => {
      const results = await searchStructured(vaultRoot, { type: "task" });
      expect(results.length).toBe(2);
    });

    it("filters by multiple fields", async () => {
      const results = await searchStructured(vaultRoot, { type: "task", status: "done" });
      expect(results.length).toBe(1);
      expect(results[0].path).toBe("task2.md");
    });

    it("filters by array field value", async () => {
      const results = await searchStructured(vaultRoot, { tags: "urgent" });
      expect(results.length).toBe(1);
      expect(results[0].path).toBe("task1.md");
    });

    it("respects limit parameter", async () => {
      const results = await searchStructured(vaultRoot, { type: "task" }, { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("returns empty array for no matches", async () => {
      const results = await searchStructured(vaultRoot, { type: "nonexistent" });
      expect(results).toEqual([]);
    });

    it("excludes hidden directories", async () => {
      await mkdir(join(vaultRoot, ".hidden"), { recursive: true });
      await writeFile(
        join(vaultRoot, ".hidden/secret.md"),
        "---\ntype: secret\n---\n\n# Secret"
      );
      const results = await searchStructured(vaultRoot, { type: "secret" });
      expect(results.every(r => !r.path.startsWith("."))).toBe(true);
    });

    it("returns path and snippet", async () => {
      const results = await searchStructured(vaultRoot, { type: "task" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBeDefined();
      expect(results[0].snippet).toBeDefined();
    });

    it("handles files without frontmatter", async () => {
      await writeFile(join(vaultRoot, "plain.md"), "Just plain text");
      const results = await searchStructured(vaultRoot, { type: "task" });
      expect(results.every(r => r.path !== "plain.md")).toBe(true);
    });

    it("handles malformed YAML gracefully", async () => {
      await writeFile(join(vaultRoot, "bad.md"), "---\ninvalid: yaml: content\n---\n\n# Bad");
      const results = await searchStructured(vaultRoot, { type: "task" });
      expect(results.every(r => r.path !== "bad.md")).toBe(true);
    });
  });
});
