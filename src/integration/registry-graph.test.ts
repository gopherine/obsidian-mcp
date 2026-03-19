import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "fs/promises";
import { join } from "path";
import { createTestContext } from "../test-helpers.js";
import { createRegistry } from "../core/registry.js";
import { graphRelatedCommand, graphCrossProjectCommand } from "../commands/graph.js";

describe("integration > command registry", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>["ctx"];
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tc = await createTestContext({ project: "my-project" });
    ctx = tc.ctx;
    vaultRoot = tc.vaultRoot;
    cleanup = tc.cleanup;
    await mkdir(join(vaultRoot, "projects/my-project/tasks"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/decisions"), { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("registry dispatch", () => {
    it("registry execute vault_read calls readCommand and returns content", async () => {
      await ctx.vaultFs.write("test.md", "# Hello\n\nSome content");
      const registry = createRegistry();
      const result = await registry.execute("vault_read", { path: "test.md" }, ctx);
      expect(typeof result).toBe("string");
      expect(result).toContain("Hello");
    });

    it("registry execute vault_write calls writeCommand and writes file", async () => {
      const registry = createRegistry();
      await registry.execute("vault_write", { path: "new-file.md", content: "# Written", mode: "overwrite" }, ctx);
      const content = await ctx.vaultFs.read("new-file.md");
      expect(content).toContain("Written");
    });

    it("registry execute vault_task add creates a task via the registry", async () => {
      const registry = createRegistry();
      const result = await registry.execute("vault_task", { action: "add", title: "Test task", project: "my-project" }, ctx);
      expect(result).toBeDefined();
      const taskList = await registry.execute("vault_task", { action: "list", project: "my-project" }, ctx);
      expect(JSON.stringify(taskList)).toContain("Test task");
    });

    it("registry execute vault_decide creates an ADR via the registry", async () => {
      const registry = createRegistry();
      const result = await registry.execute(
        "vault_decide",
        { title: "Use TypeScript", context: "Need types", decision: "Use TS", project: "my-project" },
        ctx,
      );
      expect(result).toBeDefined();
      const files = await ctx.vaultFs.list("projects/my-project/decisions");
      expect(files.length).toBe(1);
      const content = await ctx.vaultFs.read(files[0]);
      expect(content).toContain("Use TypeScript");
    });

    it("registry execute with adaptArgs converts snake_case to camelCase", async () => {
      const registry = createRegistry();
      const addResult = await registry.execute("vault_task", { action: "add", title: "Snake test", project: "my-project" }, ctx);
      const taskId = (addResult as { task_id: string }).task_id;
      expect(taskId).toMatch(/^task-\d+$/);

      await registry.execute("vault_task", { action: "update", task_id: taskId, status: "done", project: "my-project" }, ctx);
      const listResult = await registry.execute("vault_task", { action: "list", project: "my-project" }, ctx);
      expect(JSON.stringify(listResult)).toContain("done");
    });

    it("registry getToolDefinitions returns all tool definitions", () => {
      const registry = createRegistry();
      const defs = registry.getToolDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(15);
      const names = defs.map((d) => d.name);
      expect(names).toContain("vault_read");
      expect(names).toContain("vault_write");
      expect(names).toContain("vault_search");
      expect(names).toContain("vault_task");
      expect(names).toContain("vault_decide");
      expect(names).toContain("vault_learn");
      expect(names).toContain("vault_session");
      expect(names).toContain("vault_brainstorm");
      expect(names).toContain("vault_prune");
      expect(names).toContain("vault_stats");
      expect(names).toContain("vault_resume");
      expect(names).toContain("vault_deprecate");
      expect(names).toContain("vault_project_context");
      expect(names).toContain("vault_init");
      expect(names).toContain("vault_todo");
    });
  });
});

describe("integration > graph commands", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>["ctx"];
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tc = await createTestContext({ project: "my-project" });
    ctx = tc.ctx;
    vaultRoot = tc.vaultRoot;
    cleanup = tc.cleanup;
    await mkdir(join(vaultRoot, "projects/my-project"), { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("graph related", () => {
    it("graphRelated finds outgoing wikilinks from a note", async () => {
      await ctx.vaultFs.write("projects/my-project/note-a.md", "# Note A\n\nSee [[projects/my-project/note-b]] and [[projects/my-project/note-c|C Alias]]");
      await ctx.vaultFs.write("projects/my-project/note-b.md", "# Note B");
      await ctx.vaultFs.write("projects/my-project/note-c.md", "# Note C");

      const result = await graphRelatedCommand({ path: "projects/my-project/note-a.md" }, ctx);
      expect(result.outgoing).toContain("projects/my-project/note-b");
      expect(result.outgoing).toContain("projects/my-project/note-c");
    });

    it("graphRelated finds backlinks to a note", async () => {
      await ctx.vaultFs.write("projects/my-project/note-a.md", "# Note A\n\nSee [[projects/my-project/note-b]]");
      await ctx.vaultFs.write("projects/my-project/note-b.md", "# Note B\n\nLinks to [[projects/my-project/note-a]]");

      const result = await graphRelatedCommand({ path: "projects/my-project/note-a.md" }, ctx);
      expect(result.backlinks).toContain("projects/my-project/note-b.md");
    });

    it("graphRelated with hops > 1 follows linked notes", async () => {
      await ctx.vaultFs.write("projects/my-project/a.md", "# A\n\n[[projects/my-project/b]]");
      await ctx.vaultFs.write("projects/my-project/b.md", "# B\n\n[[projects/my-project/c]]");
      await ctx.vaultFs.write("projects/my-project/c.md", "# C");

      const result = await graphRelatedCommand({ path: "projects/my-project/a.md", hops: 2 }, ctx);
      expect(result.outgoing).toContain("projects/my-project/b");
      expect(result.outgoing).toContain("projects/my-project/c");
    });

    it("graphRelated on note with no links returns empty arrays", async () => {
      await ctx.vaultFs.write("projects/my-project/isolated.md", "# Isolated\n\nNo links here.");

      const result = await graphRelatedCommand({ path: "projects/my-project/isolated.md" }, ctx);
      expect(result.outgoing).toEqual([]);
      expect(result.backlinks).toEqual([]);
    });
  });

  describe("graph cross-project", () => {
    it("graphCrossProject searches across multiple project directories", async () => {
      const projectMap = { projects: { "proj-a": "/tmp/a", "proj-b": "/tmp/b" } };
      await ctx.vaultFs.write("project-map.json", JSON.stringify(projectMap));
      await mkdir(join(vaultRoot, "projects/proj-a"), { recursive: true });
      await mkdir(join(vaultRoot, "projects/proj-b"), { recursive: true });

      await ctx.vaultFs.write("projects/proj-a/note.md", "# Note A\n\nDatabase connection handling");
      await ctx.vaultFs.write("projects/proj-b/note.md", "# Note B\n\nDatabase migration scripts");

      const result = await graphCrossProjectCommand({ query: "Database" }, ctx);
      expect(typeof result).toBe("object");
      const projects = Object.keys(result);
      expect(projects.length).toBeGreaterThanOrEqual(1);
    });

    it("graphCrossProject respects limit parameter", async () => {
      for (let i = 0; i < 30; i++) {
        await ctx.vaultFs.write(`projects/my-project/bulk-${i}.md`, `# Note ${i}\n\nSearchable content here`);
      }

      const result = await graphCrossProjectCommand({ query: "Searchable", limit: 5 }, ctx);
      const totalResults = Object.values(result).flat().length;
      expect(totalResults).toBeLessThanOrEqual(5);
    });

    it("graphCrossProject returns empty for no matches", async () => {
      await ctx.vaultFs.write("projects/my-project/existing.md", "# Existing\n\nSome content");

      const result = await graphCrossProjectCommand({ query: "xyznonexistent123" }, ctx);
      expect(typeof result).toBe("object");
      expect(Object.values(result).flat().length).toBe(0);
    });
  });
});
