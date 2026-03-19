import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "fs/promises";
import { join } from "path";
import { createTestContext } from "../test-helpers.js";
import { readCommand, listCommand } from "../commands/read.js";
import { writeCommand } from "../commands/write.js";
import { searchCommand } from "../commands/search.js";
import { contextCommand } from "../commands/context.js";
import { decideCommand } from "../commands/decide.js";
import { taskCommand } from "../commands/task.js";
import { learnCommand } from "../commands/learn.js";
import { parseFrontmatter } from "../lib/frontmatter.js";

describe("integration > vault lifecycle", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>["ctx"];
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tc = await createTestContext({ project: "my-project" });
    ctx = tc.ctx;
    vaultRoot = tc.vaultRoot;
    cleanup = tc.cleanup;
    await mkdir(join(vaultRoot, "projects/my-project/decisions"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/tasks"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/learnings"), { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("read + write round-trip", () => {
    it("write then read returns the same content", async () => {
      await writeCommand({ path: "projects/my-project/context.md", content: "# Hello\n\nWorld" }, ctx);
      const result = await readCommand({ path: "projects/my-project/context.md" }, ctx);
      expect(result).toContain("# Hello");
      expect(result).toContain("World");
    });

    it("write with append mode appends to existing file", async () => {
      await writeCommand({ path: "projects/my-project/context.md", content: "First line" }, ctx);
      await writeCommand({ path: "projects/my-project/context.md", content: "Second line", mode: "append" }, ctx);
      const result = await readCommand({ path: "projects/my-project/context.md" }, ctx);
      expect(result).toContain("First line");
      expect(result).toContain("Second line");
      expect(result.indexOf("Second line")).toBeGreaterThan(result.indexOf("First line"));
    });

    it("write with prepend mode prepends before existing body", async () => {
      await writeCommand({ path: "projects/my-project/context.md", content: "Original body" }, ctx);
      await writeCommand({ path: "projects/my-project/context.md", content: "New section", mode: "prepend" }, ctx);
      const result = await readCommand({ path: "projects/my-project/context.md" }, ctx);
      expect(result).toContain("New section");
      expect(result).toContain("Original body");
      expect(result.indexOf("New section")).toBeLessThan(result.indexOf("Original body"));
    });

    it("write with overwrite mode replaces entire file", async () => {
      await writeCommand({ path: "projects/my-project/context.md", content: "Old content" }, ctx);
      await writeCommand({ path: "projects/my-project/context.md", content: "New content", mode: "overwrite" }, ctx);
      const result = await readCommand({ path: "projects/my-project/context.md" }, ctx);
      expect(result).toContain("New content");
      expect(result).not.toContain("Old content");
    });

    it("write with frontmatter creates valid YAML frontmatter", async () => {
      await writeCommand(
        { path: "projects/my-project/context.md", content: "# Context\n\nSome info", frontmatter: { type: "context", project: "my-project" } },
        ctx,
      );
      const result = await readCommand({ path: "projects/my-project/context.md" }, ctx);
      const { data, content } = parseFrontmatter(result);
      expect(data.type).toBe("context");
      expect(data.project).toBe("my-project");
      expect(content).toContain("# Context");
    });

    it("list returns directory contents at depth 1 and 2", async () => {
      await writeCommand({ path: "projects/my-project/note1.md", content: "a" }, ctx);
      await writeCommand({ path: "projects/my-project/sub/note2.md", content: "b" }, ctx);

      const depth1 = await listCommand({ path: "projects/my-project", depth: 1 }, ctx);
      expect(depth1).toContain("projects/my-project/note1.md");
      expect(depth1.some((f) => f.includes("note2.md"))).toBe(false);

      const depth2 = await listCommand({ path: "projects/my-project", depth: 2 }, ctx);
      expect(depth2).toContain("projects/my-project/note1.md");
      expect(depth2.some((f) => f.includes("note2.md"))).toBe(true);
    });
  });

  describe("search", () => {
    it("text search finds written content across files", async () => {
      await writeCommand({ path: "projects/my-project/a.md", content: "unique-needle-alpha" }, ctx);
      await writeCommand({ path: "projects/my-project/b.md", content: "unique-needle-beta" }, ctx);

      const results = await searchCommand({ query: "unique-needle" }, ctx);
      expect(results.length).toBeGreaterThanOrEqual(2);
      const paths = results.map((r) => r.path);
      expect(paths.some((p) => p.includes("a.md"))).toBe(true);
      expect(paths.some((p) => p.includes("b.md"))).toBe(true);
    });

    it("structured search filters by frontmatter fields", async () => {
      await writeCommand(
        { path: "projects/my-project/s1.md", content: "doc", frontmatter: { type: "adr", project: "my-project" } },
        ctx,
      );
      await writeCommand(
        { path: "projects/my-project/s2.md", content: "doc", frontmatter: { type: "task", project: "my-project" } },
        ctx,
      );

      const results = await searchCommand({ query: "type:adr project:my-project", structured: true }, ctx);
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.path).toContain("s1.md");
      }
    });

    it("search with project path filter narrows results", async () => {
      await writeCommand({ path: "projects/my-project/x.md", content: "pfx-target" }, ctx);
      await writeCommand({ path: "other/note.md", content: "pfx-target" }, ctx);

      const results = await searchCommand({ query: "pfx-target", project: "my-project" }, ctx);
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const r of results) {
        expect(r.path).toContain("my-project");
      }
      expect(results.some((r) => r.path.includes("other/"))).toBe(false);
    });

    it("search returns empty for no matches", async () => {
      await writeCommand({ path: "projects/my-project/z.md", content: "existing content" }, ctx);
      const results = await searchCommand({ query: "zzz-nonexistent-xyzzy" }, ctx);
      expect(results).toHaveLength(0);
    });
  });

  describe("context", () => {
    it("context command returns project context after writing context.md", async () => {
      await writeCommand(
        { path: "projects/my-project/context.md", content: "# Overview\n\n## Architecture\n\nUses TypeScript", frontmatter: { type: "context" } },
        ctx,
      );

      const result = await contextCommand({ project: "my-project" }, ctx);
      expect(result.project_slug).toBe("my-project");
      expect(result.context_md).toContain("Overview");
      expect(result.sections).toContain("Architecture");
    });

    it("context with detailLevel full returns untruncated content", async () => {
      const longContent = "A".repeat(5000);
      await writeCommand(
        { path: "projects/my-project/context.md", content: longContent, frontmatter: { type: "context" } },
        ctx,
      );

      const result = await contextCommand({ project: "my-project", detailLevel: "full" }, ctx);
      expect(result.truncated).toBe(false);
      expect(result.context_md).toContain(longContent.trim());
    });

    it("context with detailLevel summary truncates to token budget", async () => {
      const longContent = "word ".repeat(3000);
      await writeCommand(
        { path: "projects/my-project/context.md", content: longContent, frontmatter: { type: "context" } },
        ctx,
      );

      const result = await contextCommand({ project: "my-project", detailLevel: "summary", maxTokens: 100 }, ctx);
      expect(result.truncated).toBe(true);
      expect(result.token_estimate).toBeLessThanOrEqual(150);
    });
  });

  describe("cross-command flow", () => {
    it("write ADR via decide, then search finds it by content", async () => {
      const decision = await decideCommand({
        title: "Use TypeScript",
        context: "Need type safety",
        decision: "We chose TypeScript",
        project: "my-project",
      }, ctx);

      expect(decision.decision_number).toBe(1);
      expect(decision.path).toContain("decisions");

      const results = await searchCommand({ query: "TypeScript", project: "my-project" }, ctx);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const paths = results.map((r) => r.path);
      expect(paths.some((p) => p.includes(decision.path))).toBe(true);
    });

    it("write task via task, then read retrieves it", async () => {
      const taskResult = await taskCommand({
        action: "add",
        title: "Implement feature X",
        project: "my-project",
      }, ctx);

      expect(taskResult.task_id).toBe("task-001");
      expect(taskResult.path).toBeDefined();

      const content = await readCommand({ path: taskResult.path! }, ctx);
      expect(content).toContain("Implement feature X");
      const { data } = parseFrontmatter(content);
      expect(data.type).toBe("task");
      expect(data.status).toBe("backlog");
    });

    it("write learning, then context includes learning count", async () => {
      await learnCommand({
        action: "add",
        title: "Vault is fast",
        discovery: "File operations complete in under 1ms",
        project: "my-project",
      }, ctx);

      await learnCommand({
        action: "add",
        title: "Frontmatter matters",
        discovery: "YAML frontmatter enables structured search",
        project: "my-project",
      }, ctx);

      const result = await contextCommand({ project: "my-project" }, ctx);
      expect(result.learning_count).toBe(2);
    });
  });
});
