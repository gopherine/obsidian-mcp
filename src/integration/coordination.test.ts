import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir } from "fs/promises";
import { join } from "path";
import { createTestContext } from "../test-helpers.js";
import { sessionCommand } from "../commands/session.js";
import { resumeCommand } from "../commands/resume.js";
import { pruneCommand, statsCommand, deprecateCommand } from "../commands/prune.js";
import { taskCommand } from "../commands/task.js";
import { learnCommand } from "../commands/learn.js";
import { decideCommand } from "../commands/decide.js";
import { readCommand } from "../commands/read.js";
import { serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";

describe("integration > coordination", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>["ctx"];
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tc = await createTestContext({ project: "my-project" });
    ctx = tc.ctx;
    vaultRoot = tc.vaultRoot;
    cleanup = tc.cleanup;
    await mkdir(join(vaultRoot, "projects/my-project/tasks"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/sessions"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/decisions"), { recursive: true });
    await mkdir(join(vaultRoot, "projects/my-project/learnings"), { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("session lifecycle", () => {
    it("register session then list_active returns it", async () => {
      const reg = await sessionCommand({ action: "register", tool: "claude-code", project: "my-project", taskSummary: "Build API" }, ctx);

      expect(reg.session_id).toBeDefined();
      expect(reg.conflicts).toHaveLength(0);

      const list = await sessionCommand({ action: "list_active" }, ctx);

      expect(list.active_sessions).toHaveLength(1);
      expect(list.active_sessions![0].tool).toBe("claude-code");
      expect(list.active_sessions![0].project).toBe("my-project");
      expect(list.active_sessions![0].task_summary).toBe("Build API");
    });

    it("register two sessions then list_active returns both", async () => {
      await sessionCommand({ action: "register", tool: "claude-code", project: "my-project", taskSummary: "Task A" }, ctx);
      await sessionCommand({ action: "register", tool: "opencode", project: "my-project", taskSummary: "Task B" }, ctx);

      const list = await sessionCommand({ action: "list_active" }, ctx);

      expect(list.active_sessions).toHaveLength(2);
      const tools = list.active_sessions!.map((s) => s.tool);
      expect(tools).toContain("claude-code");
      expect(tools).toContain("opencode");
    });

    it("heartbeat updates session then list shows updated timestamp", async () => {
      const reg = await sessionCommand({ action: "register", tool: "claude-code", project: "my-project" }, ctx);
      const sessionId = reg.session_id!;

      const listBefore = await sessionCommand({ action: "list_active" }, ctx);
      const beforeTs = listBefore.active_sessions![0].last_heartbeat;

      await sessionCommand({ action: "heartbeat", sessionId }, ctx);

      const listAfter = await sessionCommand({ action: "list_active" }, ctx);
      const afterTs = listAfter.active_sessions![0].last_heartbeat;

      expect(new Date(afterTs).getTime()).toBeGreaterThanOrEqual(new Date(beforeTs).getTime());
    });

    it("complete session then list_active no longer includes it", async () => {
      const reg = await sessionCommand({ action: "register", tool: "claude-code", project: "my-project" }, ctx);
      const sessionId = reg.session_id!;

      await sessionCommand({ action: "complete", sessionId, project: "my-project", tool: "claude-code", outcome: "Done" }, ctx);

      const list = await sessionCommand({ action: "list_active" }, ctx);

      expect(list.active_sessions).toHaveLength(0);
    });

    it("register session with files_touched then complete persists session note", async () => {
      const reg = await sessionCommand({
        action: "register",
        tool: "claude-code",
        project: "my-project",
        taskSummary: "Refactor auth",
        filesTouched: ["src/auth.ts", "src/middleware.ts"],
      }, ctx);
      const sessionId = reg.session_id!;

      const complete = await sessionCommand({
        action: "complete",
        sessionId,
        project: "my-project",
        tool: "claude-code",
        outcome: "Refactored auth module",
        filesTouched: ["src/auth.ts", "src/middleware.ts"],
        tasksCompleted: ["task-001"],
      }, ctx);

      expect(complete.session_note_path).toBeDefined();

      const content = await readCommand({ path: complete.session_note_path! }, ctx);

      expect(content).toContain("claude-code");
      expect(content).toContain("Refactored auth module");
      expect(content).toContain("src/auth.ts");
    });
  });

  describe("resume", () => {
    it("resume with no sessions returns empty last_sessions and suggested_next_steps", async () => {
      const result = await resumeCommand({ project: "my-project" }, ctx);

      expect(result.project).toBe("my-project");
      expect(result.last_sessions).toHaveLength(0);
      expect(result.active_sessions).toHaveLength(0);
      expect(result.interrupted_sessions).toHaveLength(0);
      expect(result.suggested_next_steps).toHaveLength(0);
    });

    it("create tasks and sessions then resume returns interrupted/in-progress context", async () => {
      await taskCommand({ action: "add", title: "Active task", project: "my-project" }, ctx);
      await taskCommand({ action: "update", taskId: "task-001", status: "in-progress", project: "my-project" }, ctx);

      const reg = await sessionCommand({
        action: "register",
        tool: "claude-code",
        project: "my-project",
        taskSummary: "Working on auth",
      }, ctx);

      await sessionCommand({
        action: "complete",
        sessionId: reg.session_id!,
        project: "my-project",
        tool: "claude-code",
        outcome: "Implemented auth flow",
      }, ctx);

      const result = await resumeCommand({ project: "my-project" }, ctx);

      expect(result.last_sessions.length).toBeGreaterThanOrEqual(1);
      expect(result.last_sessions[0].tool).toBe("claude-code");
      expect(result.last_sessions[0].outcome).toBe("Implemented auth flow");
      expect(result.suggested_next_steps.length).toBeGreaterThanOrEqual(1);
      expect(result.suggested_next_steps.some((s) => s.includes("In-progress task"))).toBe(true);
    });

    it("resume respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        const reg = await sessionCommand({
          action: "register",
          tool: `tool-${i}`,
          project: "my-project",
          taskSummary: `Session ${i}`,
        }, ctx);

        await sessionCommand({
          action: "complete",
          sessionId: reg.session_id!,
          project: "my-project",
          tool: `tool-${i}`,
          outcome: `Completed session ${i}`,
        }, ctx);
      }

      const result = await resumeCommand({ project: "my-project", limit: 2 }, ctx);

      expect(result.last_sessions.length).toBeLessThanOrEqual(2);
    });
  });

  describe("prune", () => {
    it("prune dry-run mode reports candidates but does not delete", async () => {
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sessionContent = serializeFrontmatter(
        createFrontmatter({
          type: "session",
          status: "completed",
          completed_at: oldDate,
          created: oldDate,
        }),
        "\n# Old session\n"
      );
      await ctx.vaultFs.write("projects/my-project/sessions/2025-01-01-claude-aabbccdd.md", sessionContent);

      const result = await pruneCommand({ mode: "dry-run", project: "my-project", policy: { sessions: 30 } }, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].stats.sessions_scanned).toBe(1);
      expect(result[0].stats.total_archived).toBe(1);
      expect(result[0].stats.total_deleted).toBe(0);

      const files = await ctx.vaultFs.list("projects/my-project/sessions", 1);
      expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(1);
    });

    it("prune archive mode moves old sessions to _archive", async () => {
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sessionContent = serializeFrontmatter(
        createFrontmatter({
          type: "session",
          status: "completed",
          completed_at: oldDate,
          created: oldDate,
        }),
        "\n# Old session\n"
      );
      await ctx.vaultFs.write("projects/my-project/sessions/2025-01-01-claude-aabbccdd.md", sessionContent);

      const result = await pruneCommand({ mode: "archive", project: "my-project", policy: { sessions: 30 } }, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].archived).toHaveLength(1);
      expect(result[0].archived[0].to).toContain("_archive");

      const activeFiles = await ctx.vaultFs.list("projects/my-project/sessions", 1);
      expect(activeFiles.filter((f) => f.endsWith(".md"))).toHaveLength(0);
    });

    it("prune with no stale items returns empty results", async () => {
      const recentDate = new Date().toISOString();
      const sessionContent = serializeFrontmatter(
        createFrontmatter({
          type: "session",
          status: "completed",
          completed_at: recentDate,
          created: recentDate,
        }),
        "\n# Recent session\n"
      );
      await ctx.vaultFs.write("projects/my-project/sessions/2026-03-19-claude-aabbccdd.md", sessionContent);

      const result = await pruneCommand({ mode: "dry-run", project: "my-project", policy: { sessions: 30 } }, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].stats.sessions_scanned).toBe(1);
      expect(result[0].stats.total_archived).toBe(0);
      expect(result[0].stats.total_deleted).toBe(0);
    });

    it("prune delete mode removes old tasks", async () => {
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const taskContent = serializeFrontmatter(
        createFrontmatter({
          type: "task",
          id: "task-old-001",
          status: "done",
          created: oldDate,
          updated: oldDate,
        }),
        "\n# Old task\n"
      );
      await ctx.vaultFs.write("projects/my-project/tasks/task-old-001.md", taskContent);

      const result = await pruneCommand({ mode: "delete", project: "my-project", policy: { doneTasks: 30 } }, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].deleted).toHaveLength(1);
      expect(result[0].deleted[0]).toContain("task-old-001");

      const files = await ctx.vaultFs.list("projects/my-project/tasks", 1);
      expect(files.filter((f) => f.endsWith(".md"))).toHaveLength(0);
    });
  });

  describe("stats", () => {
    it("stats returns task breakdown", async () => {
      await taskCommand({ action: "add", title: "Backlog task", project: "my-project" }, ctx);
      await taskCommand({ action: "add", title: "Active task", project: "my-project" }, ctx);
      await taskCommand({ action: "add", title: "Done task", project: "my-project" }, ctx);
      await taskCommand({ action: "update", taskId: "task-002", status: "in-progress", project: "my-project" }, ctx);
      await taskCommand({ action: "update", taskId: "task-003", status: "done", project: "my-project" }, ctx);

      const stats = await statsCommand({ project: "my-project" }, ctx);

      expect(stats.project).toBe("my-project");
      expect(stats.tasks.total).toBe(3);
      expect(stats.tasks.backlog).toBe(1);
      expect(stats.tasks.inProgress).toBe(1);
      expect(stats.tasks.done).toBe(1);
    });

    it("stats after creating tasks reflects new count", async () => {
      const before = await statsCommand({ project: "my-project" }, ctx);

      expect(before.tasks.total).toBe(0);

      await taskCommand({ action: "add", title: "New task", project: "my-project" }, ctx);

      const after = await statsCommand({ project: "my-project" }, ctx);

      expect(after.tasks.total).toBe(1);
      expect(after.tasks.backlog).toBe(1);
    });

    it("stats includes learning and ADR counts", async () => {
      await learnCommand({
        action: "add",
        title: "Test learning",
        discovery: "Something useful",
        project: "my-project",
      }, ctx);

      await decideCommand({
        title: "Use React",
        context: "Need UI framework",
        decision: "React chosen",
        project: "my-project",
      }, ctx);

      const stats = await statsCommand({ project: "my-project" }, ctx);

      expect(stats.learnings).toBe(1);
      expect(stats.adrs).toBe(1);
      expect(stats.totalFiles).toBeGreaterThanOrEqual(2);
    });
  });

  describe("deprecate", () => {
    it("deprecate marks vault item with deprecated status", async () => {
      await decideCommand({
        title: "Old decision",
        context: "Initial context",
        decision: "Initial decision",
        project: "my-project",
      }, ctx);

      const adrList = await ctx.vaultFs.list("projects/my-project/decisions", 1);
      const adrPath = adrList.find((f) => f.endsWith(".md"))!;

      const result = await deprecateCommand({ path: adrPath }, ctx);

      expect(result.path).toBe(adrPath);
      expect(result.status).toBe("deprecated");

      const content = await readCommand({ path: adrPath }, ctx);
      expect(content).toContain("status: deprecated");
    });

    it("deprecate with reason appends deprecation notice", async () => {
      await learnCommand({
        action: "add",
        title: "Outdated learning",
        discovery: "No longer relevant",
        project: "my-project",
      }, ctx);

      const learnList = await ctx.vaultFs.list("projects/my-project/learnings", 1);
      const learnPath = learnList.find((f) => f.endsWith(".md"))!;

      const reason = "Replaced by new approach";
      await deprecateCommand({ path: learnPath, reason }, ctx);

      const content = await readCommand({ path: learnPath }, ctx);

      expect(content).toContain("status: deprecated");
      expect(content).toContain("Deprecated");
      expect(content).toContain(reason);
    });
  });
});
