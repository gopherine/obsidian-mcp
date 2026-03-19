import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { todoCommand } from "./todo.js";
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

describe("todoCommand", () => {
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

  describe("list todos", () => {
    it("returns empty array when no todos file", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await todoCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.todos).toEqual([]);
    });

    it("lists pending todos", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
project: test-project
---

# Todos

- [ ] First task
- [x] Completed task
- [ ] 🔴 High priority task
`
      );

      const result = await todoCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.todos).toHaveLength(2);
      expect(result.todos[0].text).toBe("First task");
      expect(result.todos[1].text).toBe("High priority task");
    });

    it("filters to blockers only when requested", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
project: test-project
---

# Todos

- [ ] 🟡 Medium priority
- [ ] 🔴 High priority blocker
- [ ] 🟢 Low priority
`
      );

      const result = await todoCommand({
        action: "list",
        blockersOnly: true,
        project: "test-project",
      }, ctx);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].text).toBe("High priority blocker");
      expect(result.todos[0].priority).toBe("high");
    });

    it("parses priority from emojis", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] 🔴 High
- [ ] 🟡 Medium
- [ ] 🟢 Low
- [ ] No emoji (medium default)
`
      );

      const result = await todoCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.todos[0].priority).toBe("high");
      expect(result.todos[1].priority).toBe("medium");
      expect(result.todos[2].priority).toBe("low");
      expect(result.todos[3].priority).toBe("medium");
    });
  });

  describe("add todo", () => {
    it("creates todos file if it does not exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await todoCommand({
        action: "add",
        item: "New task",
        project: "test-project",
      }, ctx);

      expect(result.todos).toHaveLength(1);
      expect(result.todos[0].text).toBe("New task");

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("type: todo");
      expect(content).toContain("# Todos");
    });

    it("appends to existing todos file", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] Existing task
`
      );

      const result = await todoCommand({
        action: "add",
        item: "New task",
        project: "test-project",
      }, ctx);

      expect(result.todos).toHaveLength(2);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("Existing task");
      expect(content).toContain("New task");
    });

    it("adds with high priority emoji", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await todoCommand({
        action: "add",
        item: "Urgent task",
        priority: "high",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("🔴 Urgent task");
    });

    it("adds with low priority emoji", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await todoCommand({
        action: "add",
        item: "Low priority task",
        priority: "low",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("🟢 Low priority task");
    });

    it("adds with medium priority emoji by default", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await todoCommand({
        action: "add",
        item: "Normal task",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("🟡 Normal task");
    });

    it("requires item text for add", async () => {
      await expect(
        todoCommand({
          action: "add",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Item text required for add");
    });
  });

  describe("complete todo", () => {
    it("marks todo as completed", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] Task to complete
- [ ] Another task
`
      );

      const result = await todoCommand({
        action: "complete",
        item: "Task to complete",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("- [x] Task to complete");
      expect(content).toContain("- [ ] Another task");
    });

    it("works with priority emoji", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] 🔴 Priority task
`
      );

      await todoCommand({
        action: "complete",
        item: "Priority task",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).toContain("- [x] 🔴 Priority task");
    });

    it("requires item text for complete", async () => {
      await expect(
        todoCommand({
          action: "complete",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Item text required for complete");
    });

    it("throws if todos file does not exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await expect(
        todoCommand({
          action: "complete",
          item: "Task",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("No todos file found");
    });
  });

  describe("remove todo", () => {
    it("removes a pending todo", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] Task to remove
- [ ] Task to keep
`
      );

      const result = await todoCommand({
        action: "remove",
        item: "Task to remove",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).not.toContain("Task to remove");
      expect(content).toContain("Task to keep");
    });

    it("removes a completed todo", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [x] Completed task to remove
- [ ] Pending task
`
      );

      await todoCommand({
        action: "remove",
        item: "Completed task to remove",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).not.toContain("Completed task to remove");
      expect(content).toContain("Pending task");
    });

    it("removes todo with priority emoji", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/todos.md",
        `---
type: todo
---

# Todos

- [ ] 🔴 Priority task to remove
`
      );

      await todoCommand({
        action: "remove",
        item: "Priority task to remove",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/todos.md");
      expect(content).not.toContain("Priority task to remove");
    });

    it("requires item text for remove", async () => {
      await expect(
        todoCommand({
          action: "remove",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Item text required for remove");
    });

    it("throws if todos file does not exist for remove", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await expect(
        todoCommand({
          action: "remove",
          item: "Task",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("No todos file found");
    });
  });

  describe("unknown action", () => {
    it("throws error for unknown action", async () => {
      await expect(
        todoCommand({
          action: "unknown" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Unknown action: unknown");
    });
  });
});
