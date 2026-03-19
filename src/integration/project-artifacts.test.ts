import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "fs/promises";
import { join } from "path";
import { createTestContext } from "../test-helpers.js";
import { taskCommand } from "../commands/task.js";
import { learnCommand } from "../commands/learn.js";
import { decideCommand } from "../commands/decide.js";
import { brainstormCommand } from "../commands/brainstorm.js";
import { todoCommand } from "../commands/todo.js";
import { pruneCommand } from "../commands/prune.js";
import { contextCommand } from "../commands/context.js";
import { searchCommand } from "../commands/search.js";
import { readCommand } from "../commands/read.js";

describe("integration > project artifacts", () => {
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
    await mkdir(join(vaultRoot, "projects/my-project/brainstorms"), { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("task + learn cross-commands", () => {
    it("create task then list tasks returns it", async () => {
      const added = await taskCommand({ action: "add", title: "Build auth system", project: "my-project" }, ctx);

      expect(added.task_id).toBe("task-001");
      expect(added.path).toBeDefined();

      const listed = await taskCommand({ action: "list", project: "my-project" }, ctx);

      expect(listed.tasks).toHaveLength(1);
      expect(listed.tasks![0].title).toBe("Build auth system");
      expect(listed.tasks![0].status).toBe("backlog");
    });

    it("create multiple tasks then board groups by status", async () => {
      await taskCommand({ action: "add", title: "Task A", project: "my-project" }, ctx);
      await taskCommand({ action: "add", title: "Task B", project: "my-project" }, ctx);

      await taskCommand({ action: "update", taskId: "task-001", status: "in-progress", project: "my-project" }, ctx);

      const result = await taskCommand({ action: "board", project: "my-project" }, ctx);

      expect(result.board!["backlog"]).toHaveLength(1);
      expect(result.board!["backlog"]![0].id).toBe("task-002");
      expect(result.board!["in-progress"]).toHaveLength(1);
      expect(result.board!["in-progress"]![0].id).toBe("task-001");
    });

    it("update task status from backlog to in-progress", async () => {
      await taskCommand({ action: "add", title: "Migrate DB", project: "my-project" }, ctx);

      const updated = await taskCommand({ action: "update", taskId: "task-001", status: "in-progress", project: "my-project" }, ctx);

      expect(updated.updated_fields).toContain("status");

      const listed = await taskCommand({ action: "list", status: "in-progress", project: "my-project" }, ctx);
      expect(listed.tasks).toHaveLength(1);
      expect(listed.tasks![0].id).toBe("task-001");
    });

    it("create learning then list learnings returns it", async () => {
      const added = await learnCommand({
        action: "add",
        title: "Paging is fast",
        discovery: "Cursor-based pagination outperforms offset for large datasets",
        project: "my-project",
      }, ctx);

      expect(added.learning_id).toBeDefined();
      expect(added.path).toBeDefined();

      const listed = await learnCommand({ action: "list", project: "my-project" }, ctx);

      expect(listed.learnings).toHaveLength(1);
      expect(listed.learnings![0].title).toBe("Paging is fast");
    });

    it("create multiple learnings then filter by tag", async () => {
      await learnCommand({
        action: "add",
        title: "Redis caching",
        discovery: "Redis reduces DB load by 60%",
        tags: ["performance"],
        project: "my-project",
      }, ctx);
      await learnCommand({
        action: "add",
        title: "Type safety",
        discovery: "Strict mode catches bugs at compile time",
        tags: ["typescript"],
        project: "my-project",
      }, ctx);
      await learnCommand({
        action: "add",
        title: "Connection pooling",
        discovery: "PG pool with 10 connections handles 1000 RPS",
        tags: ["performance"],
        project: "my-project",
      }, ctx);

      const perfLearnings = await learnCommand({ action: "list", tag: "performance", project: "my-project" }, ctx);

      expect(perfLearnings.learnings).toHaveLength(2);
      for (const l of perfLearnings.learnings!) {
        expect(l.tags).toContain("performance");
      }
    });

    it("create task with blockedBy then update resolves blockers", async () => {
      await taskCommand({
        action: "add",
        title: "Set up CI",
        blockedBy: ["task-999"],
        project: "my-project",
      }, ctx);

      const listed = await taskCommand({ action: "list", project: "my-project" }, ctx);
      expect(listed.tasks![0].blocked_by).toEqual(["task-999"]);

      const updated = await taskCommand({
        action: "update",
        taskId: "task-001",
        blockedBy: [],
        project: "my-project",
      }, ctx);

      expect(updated.updated_fields).toContain("blocked_by");

      const after = await taskCommand({ action: "list", project: "my-project" }, ctx);
      expect(after.tasks![0].blocked_by).toEqual([]);
    });
  });

  describe("decide + brainstorm", () => {
    it("create ADR with all fields then read it back via readCommand", async () => {
      const result = await decideCommand({
        title: "Use PostgreSQL",
        context: "Need relational DB for ACID compliance",
        decision: "PostgreSQL chosen for JSON support and extensions",
        alternatives: "MySQL, SQLite, MongoDB",
        consequences: "Requires DB hosting, migrations needed",
        project: "my-project",
      }, ctx);

      expect(result.decision_number).toBe(1);

      const content = await readCommand({ path: result.path }, ctx);

      expect(content).toContain("Use PostgreSQL");
      expect(content).toContain("Need relational DB");
      expect(content).toContain("PostgreSQL chosen");
      expect(content).toContain("MySQL, SQLite");
      expect(content).toContain("Requires DB hosting");
    });

    it("create ADR then second ADR has incremented number", async () => {
      const first = await decideCommand({
        title: "First decision",
        context: "C1",
        decision: "D1",
        project: "my-project",
      }, ctx);

      const second = await decideCommand({
        title: "Second decision",
        context: "C2",
        decision: "D2",
        project: "my-project",
      }, ctx);

      expect(first.decision_number).toBe(1);
      expect(second.decision_number).toBe(2);
      expect(second.path).not.toBe(first.path);
    });

    it("create brainstorm then read it back, verify content", async () => {
      const result = await brainstormCommand({
        topic: "Feature flag system",
        content: "Should support percentage-based rollouts and user targeting",
        project: "my-project",
      }, ctx);

      expect(result.total_entries).toBe(1);

      const content = await readCommand({ path: result.path }, ctx);

      expect(content).toContain("Feature flag system");
      expect(content).toContain("percentage-based rollouts");
    });

    it("create brainstorm to existing topic appends entry", async () => {
      const first = await brainstormCommand({
        topic: "API design",
        content: "Consider REST vs GraphQL",
        project: "my-project",
      }, ctx);

      expect(first.total_entries).toBe(1);

      const second = await brainstormCommand({
        topic: "API design",
        content: "Versioning via URL path is simpler",
        project: "my-project",
      }, ctx);

      expect(second.total_entries).toBe(2);
      expect(second.path).toBe(first.path);

      const content = await readCommand({ path: second.path }, ctx);

      expect(content).toContain("REST vs GraphQL");
      expect(content).toContain("Versioning via URL path");
    });
  });

  describe("todo", () => {
    it("add todo then list returns it", async () => {
      await todoCommand({ action: "add", item: "Write unit tests", project: "my-project" }, ctx);

      const result = await todoCommand({ action: "list", project: "my-project" }, ctx);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].text).toBe("Write unit tests");
      expect(result.todos[0].completed).toBe(false);
    });

    it("add multiple todos then complete one", async () => {
      await todoCommand({ action: "add", item: "Setup CI", project: "my-project" }, ctx);
      await todoCommand({ action: "add", item: "Deploy staging", project: "my-project" }, ctx);
      await todoCommand({ action: "add", item: "Write docs", project: "my-project" }, ctx);

      await todoCommand({ action: "complete", item: "Deploy staging", project: "my-project" }, ctx);

      const result = await todoCommand({ action: "list", project: "my-project" }, ctx);

      expect(result.todos).toHaveLength(2);
      const texts = result.todos.map((t) => t.text);
      expect(texts).toContain("Setup CI");
      expect(texts).toContain("Write docs");
      expect(texts).not.toContain("Deploy staging");
    });

    it("add todo with high priority then list with blockersOnly returns it", async () => {
      await todoCommand({ action: "add", item: "Fix critical bug", priority: "high", project: "my-project" }, ctx);
      await todoCommand({ action: "add", item: "Refactor module", priority: "medium", project: "my-project" }, ctx);
      await todoCommand({ action: "add", item: "Update readme", priority: "low", project: "my-project" }, ctx);

      const result = await todoCommand({ action: "list", blockersOnly: true, project: "my-project" }, ctx);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].text).toBe("Fix critical bug");
      expect(result.todos[0].priority).toBe("high");
    });

    it("add todo then remove it", async () => {
      await todoCommand({ action: "add", item: "Temporary item", project: "my-project" }, ctx);
      await todoCommand({ action: "add", item: "Keep this", project: "my-project" }, ctx);

      await todoCommand({ action: "remove", item: "Temporary item", project: "my-project" }, ctx);

      const result = await todoCommand({ action: "list", project: "my-project" }, ctx);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].text).toBe("Keep this");
    });
  });

  describe("multi-artifact flow", () => {
    it("create ADR, task, and learning for same project then context includes learning count", async () => {
      await decideCommand({
        title: "Use monorepo",
        context: "Need shared code",
        decision: "Turborepo with npm workspaces",
        project: "my-project",
      }, ctx);

      await taskCommand({ action: "add", title: "Setup turborepo", project: "my-project" }, ctx);

      await learnCommand({
        action: "add",
        title: "Turborepo caching",
        discovery: "Remote cache speeds up CI by 3x",
        project: "my-project",
      }, ctx);

      await learnCommand({
        action: "add",
        title: "Workspaces limits",
        discovery: "npm workspaces support up to 200 packages",
        project: "my-project",
      }, ctx);

      const result = await contextCommand({ project: "my-project" }, ctx);

      expect(result.learning_count).toBe(2);
      expect(result.project_slug).toBe("my-project");
    });

    it("create tasks then prune in dry-run mode reports them (zero actual deletions)", async () => {
      await taskCommand({ action: "add", title: "Old task", project: "my-project" }, ctx);
      await taskCommand({ action: "add", title: "Another task", project: "my-project" }, ctx);

      await taskCommand({ action: "update", taskId: "task-001", status: "done", project: "my-project" }, ctx);
      await taskCommand({ action: "update", taskId: "task-002", status: "cancelled", project: "my-project" }, ctx);

      const result = await pruneCommand({ mode: "dry-run", project: "my-project" }, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].project).toBe("my-project");
      expect(result[0].stats.total_deleted).toBe(0);
      expect(result[0].stats.total_archived).toBe(0);

      const tasks = await taskCommand({ action: "list", project: "my-project" }, ctx);
      expect(tasks.tasks).toHaveLength(2);
    });

    it("create ADR then search finds it by title", async () => {
      const adr = await decideCommand({
        title: "Adopt Zero Trust Security",
        context: "Traditional perimeter security is insufficient",
        decision: "Implement zero-trust architecture with mTLS",
        project: "my-project",
      }, ctx);

      const results = await searchCommand({ query: "Zero Trust Security", project: "my-project" }, ctx);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const paths = results.map((r) => r.path);
      expect(paths.some((p) => p === adr.path)).toBe(true);
    });
  });
});
