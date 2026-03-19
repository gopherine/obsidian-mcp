import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { taskCommand } from "./task.js";
import { VaultFS } from "../lib/vault-fs.js";
import type { CommandContext } from "../core/types.js";

function createCommandContext(vaultFs: VaultFS, overrides?: Partial<CommandContext>): CommandContext {
  return {
    vaultFs,
    vaultPath: vaultFs.root,
    sessionRegistry: {} as any,
    config: {} as any,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("taskCommand", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;
  let ctx: CommandContext;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
    ctx = createCommandContext(vaultFs);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("add task", () => {
    it("creates new task with auto-numbering", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      const result = await taskCommand({
        action: "add",
        title: "Implement Feature X",
        project: "test-project",
      }, ctx);

      expect(result.task_id).toBe("task-001");
      expect(result.path).toBe("projects/test-project/tasks/task-001-implement-feature-x.md");

      const content = await vaultFs.read(result.path!);
      expect(content).toContain("type: task");
      expect(content).toContain("status: backlog");
      expect(content).toContain("# Implement Feature X");
    });

    it("increments task number for subsequent tasks", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      const result1 = await taskCommand({
        action: "add",
        title: "First Task",
        project: "test-project",
      }, ctx);

      const result2 = await taskCommand({
        action: "add",
        title: "Second Task",
        project: "test-project",
      }, ctx);

      expect(result1.task_id).toBe("task-001");
      expect(result2.task_id).toBe("task-002");
    });

    it("sets default priority to p1", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/tasks/task-001-task.md");
      expect(content).toContain("priority: p1");
    });

    it("accepts all valid priorities", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      for (const priority of ["p0", "p1", "p2"] as const) {
        await taskCommand({
          action: "add",
          title: `Task ${priority}`,
          priority,
          project: "test-project",
        }, ctx);
      }

      const files = await vaultFs.list("projects/test-project/tasks", 1);
      expect(files.filter(f => f.endsWith(".md"))).toHaveLength(3);
    });

    it("rejects invalid priority", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await expect(
        taskCommand({
          action: "add",
          title: "Task",
          priority: "p3" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow('Invalid priority "p3"');
    });

    it("requires title for add", async () => {
      await expect(
        taskCommand({
          action: "add",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Title required for add");
    });

    it("stores blocked_by and assigned_to", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Blocked Task",
        blockedBy: ["task-001"],
        assignedTo: "alice",
        sprint: "sprint-1",
        tags: ["frontend"],
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/tasks/task-001-blocked-task.md");
      expect(content).toContain("blocked_by:");
      expect(content).toContain("- task-001");
      expect(content).toContain("assigned_to: alice");
      expect(content).toContain("sprint: sprint-1");
      expect(content).toContain("- frontend");
    });
  });

  describe("list tasks", () => {
    it("returns empty array when no tasks", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      const result = await taskCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.tasks).toEqual([]);
    });

    it("lists all tasks sorted by priority and id", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "P1 Task",
        priority: "p1",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "P0 Task",
        priority: "p0",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "P2 Task",
        priority: "p2",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks![0].priority).toBe("p0");
      expect(result.tasks![1].priority).toBe("p1");
      expect(result.tasks![2].priority).toBe("p2");
    });

    it("filters by status", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task 1",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "Task 2",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "update",
        taskId: "task-001",
        status: "done",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "list",
        status: "done",
        project: "test-project",
      }, ctx);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].id).toBe("task-001");
    });

    it("filters by priority", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "P0 Task",
        priority: "p0",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "P2 Task",
        priority: "p2",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "list",
        priority: "p0",
        project: "test-project",
      }, ctx);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].priority).toBe("p0");
    });

    it("filters by assignedTo", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Alice Task",
        assignedTo: "alice",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "Bob Task",
        assignedTo: "bob",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "list",
        assignedTo: "alice",
        project: "test-project",
      }, ctx);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks![0].assigned_to).toBe("alice");
    });
  });

  describe("update task", () => {
    it("updates task status", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task to Update",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "update",
        taskId: "task-001",
        status: "in-progress",
        project: "test-project",
      }, ctx);

      expect(result.updated_fields).toContain("status");

      const content = await vaultFs.read("projects/test-project/tasks/task-001-task-to-update.md");
      expect(content).toContain("status: in-progress");
    });

    it("updates task priority", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "update",
        taskId: "task-001",
        priority: "p0",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/tasks/task-001-task.md");
      expect(content).toContain("priority: p0");
    });

    it("updates task title", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Old Title",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "update",
        taskId: "task-001",
        title: "New Title",
        project: "test-project",
      }, ctx);

      expect(result.updated_fields).toContain("title");

      const content = await vaultFs.read("projects/test-project/tasks/task-001-old-title.md");
      expect(content).toContain("# New Title");
    });

    it("updates blocked_by", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "update",
        taskId: "task-001",
        blockedBy: ["task-002"],
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/tasks/task-001-task.md");
      expect(content).toContain("blocked_by:");
      expect(content).toContain("- task-002");
    });

    it("requires taskId for update", async () => {
      await expect(
        taskCommand({
          action: "update",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Task ID required for update");
    });

    it("throws if task not found", async () => {
      await expect(
        taskCommand({
          action: "update",
          taskId: "task-999",
          status: "done",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Task not found: task-999");
    });

    it("rejects invalid status on update", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Task",
        project: "test-project",
      }, ctx);

      await expect(
        taskCommand({
          action: "update",
          taskId: "task-001",
          status: "invalid" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow('Invalid status "invalid"');
    });
  });

  describe("board view", () => {
    it("groups tasks by status", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await taskCommand({
        action: "add",
        title: "Backlog Task 1",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "Backlog Task 2",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "add",
        title: "In Progress Task",
        project: "test-project",
      }, ctx);

      await taskCommand({
        action: "update",
        taskId: "task-003",
        status: "in-progress",
        project: "test-project",
      }, ctx);

      const result = await taskCommand({
        action: "board",
        project: "test-project",
      }, ctx);

      expect(result.board!["backlog"]).toHaveLength(2);
      expect(result.board!["in-progress"]).toHaveLength(1);
      expect(result.board!["done"]).toHaveLength(0);
    });

    it("includes all status columns", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      const result = await taskCommand({
        action: "board",
        project: "test-project",
      }, ctx);

      expect(result.board).toHaveProperty("backlog");
      expect(result.board).toHaveProperty("in-progress");
      expect(result.board).toHaveProperty("blocked");
      expect(result.board).toHaveProperty("done");
      expect(result.board).toHaveProperty("cancelled");
    });
  });

  describe("unknown action", () => {
    it("throws error for unknown action", async () => {
      await expect(
        taskCommand({
          action: "unknown" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Unknown action: unknown");
    });
  });
});
