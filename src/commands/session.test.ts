import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { sessionCommand } from "./session.js";
import { SessionRegistryManager } from "../lib/session-registry.js";
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

describe("sessionCommand", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;
  let registry: SessionRegistryManager;
  let ctx: CommandContext;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    await mkdir(join(vaultRoot, "coordination/locks"), { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
    registry = new SessionRegistryManager(vaultRoot, 24);
    ctx = createCommandContext(vaultFs, { sessionRegistry: registry });
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("register", () => {
    it("registers a new session", async () => {
      const result = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
        taskSummary: "Implement feature X",
        filesTouched: ["src/index.ts"],
      }, ctx);

      expect(result.session_id).toBeDefined();
      expect(result.session_id).toMatch(/^claude-/);
      expect(result.conflicts).toEqual([]);
    });

    it("detects conflicts when touching same files", async () => {
      await sessionCommand({
        action: "register",
        tool: "cursor",
        project: "test-project",
        taskSummary: "Working on Y",
        filesTouched: ["src/shared.ts"],
      }, ctx);

      const result = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
        taskSummary: "Working on X",
        filesTouched: ["src/shared.ts", "src/other.ts"],
      }, ctx);

      expect(result.conflicts).toBeDefined();
      expect(result.conflicts!.length).toBeGreaterThan(0);
      expect(result.conflicts![0].overlapping_files).toContain("src/shared.ts");
    });

    it("requires tool name for register", async () => {
      await expect(
        sessionCommand({
          action: "register",
        }, ctx)
      ).rejects.toThrow("Tool name required for register");
    });
  });

  describe("heartbeat", () => {
    it("updates session timestamp", async () => {
      const { session_id } = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
      }, ctx);

      const result = await sessionCommand({
        action: "heartbeat",
        sessionId: session_id!,
      }, ctx);

      expect(result).toEqual({});
    });

    it("requires session ID for heartbeat", async () => {
      await expect(
        sessionCommand({
          action: "heartbeat",
        }, ctx)
      ).rejects.toThrow("Session ID required for heartbeat");
    });
  });

  describe("complete", () => {
    it("marks session as completed", async () => {
      const { session_id } = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
        taskSummary: "Task summary",
      }, ctx);

      const result = await sessionCommand({
        action: "complete",
        sessionId: session_id!,
        taskSummary: "Completed task",
      }, ctx);

      expect(result).toEqual({});
    });

    it("persists session note when vault and project provided", async () => {
      const { session_id } = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
      }, ctx);

      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });

      const result = await sessionCommand(
        {
          action: "complete",
          sessionId: session_id!,
          project: "test-project",
          tool: "claude",
          outcome: "Feature implemented",
          filesTouched: ["src/index.ts"],
          tasksCompleted: ["task-001"],
        },
        ctx
      );

      expect(result.session_note_path).toBeDefined();
      expect(result.session_note_path).toMatch(/projects\/test-project\/sessions\/\d{4}-\d{2}-\d{2}-claude-/);

      const content = await vaultFs.read(result.session_note_path!);
      expect(content).toContain("type: session");
      expect(content).toContain("tool: claude");
      expect(content).toContain("Feature implemented");
    });

    it("requires session ID for complete", async () => {
      await expect(
        sessionCommand({
          action: "complete",
        }, ctx)
      ).rejects.toThrow("Session ID required for complete");
    });
  });

  describe("list_active", () => {
    it("lists active sessions", async () => {
      await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
        taskSummary: "Task 1",
      }, ctx);

      await sessionCommand({
        action: "register",
        tool: "cursor",
        project: "other-project",
        taskSummary: "Task 2",
      }, ctx);

      const result = await sessionCommand({
        action: "list_active",
      }, ctx);

      expect(result.active_sessions).toBeDefined();
      expect(result.active_sessions!.length).toBeGreaterThanOrEqual(2);
    });

    it("excludes completed sessions", async () => {
      const { session_id } = await sessionCommand({
        action: "register",
        tool: "claude",
        project: "test-project",
      }, ctx);

      await sessionCommand({
        action: "register",
        tool: "cursor",
        project: "test-project",
      }, ctx);

      await sessionCommand({
        action: "complete",
        sessionId: session_id!,
      }, ctx);

      const result = await sessionCommand({
        action: "list_active",
      }, ctx);

      const activeIds = result.active_sessions!.map((s) => s.id);
      expect(activeIds).not.toContain(session_id);
    });
  });

  describe("persist session note", () => {
    it("creates session note when completing with project and vaultFs", async () => {
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });

      const { session_id } = await sessionCommand({
        action: "register",
        tool: "claude-code",
        project: "test-project",
        taskSummary: "Build feature X",
        filesTouched: ["src/index.ts"],
      }, ctx);

      await sessionCommand({
        action: "complete",
        sessionId: session_id!,
        project: "test-project",
        outcome: "Completed successfully",
        filesTouched: ["src/index.ts"],
        tasksCompleted: ["task-001"],
      }, ctx);

      const files = await vaultFs.list("projects/test-project/sessions");
      expect(files.length).toBeGreaterThanOrEqual(1);
      const notePath = files.find((f) => f.endsWith(".md"));
      expect(notePath).toBeDefined();

      const content = await vaultFs.read(notePath!);
      expect(content).toContain("claude-code");
      expect(content).toContain("Completed successfully");
      expect(content).toContain("src/index.ts");
    });

    it("extracts tool name from session ID for note heading", async () => {
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });

      const { session_id } = await sessionCommand({
        action: "register",
        tool: "my-custom-tool",
        project: "test-project",
      }, ctx);

      await sessionCommand({
        action: "complete",
        sessionId: session_id!,
        project: "test-project",
        outcome: "Done",
      }, ctx);

      const files = await vaultFs.list("projects/test-project/sessions");
      const notePath = files.find((f) => f.endsWith(".md"));
      const content = await vaultFs.read(notePath!);
      expect(content).toContain("my-custom-tool");
    });
  });

  describe("unknown action", () => {
    it("throws error for unknown action", async () => {
      await expect(
        sessionCommand({
          action: "unknown" as any,
        }, ctx)
      ).rejects.toThrow("Unknown action: unknown");
    });
  });
});
