import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { resumeCommand, formatResumeContext } from "./resume.js";
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

describe("resumeCommand", () => {
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

  describe("resume context", () => {
    it("returns project slug", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.project).toBe("test-project");
    });

    it("returns empty arrays when no sessions or tasks", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_sessions).toEqual([]);
      expect(result.active_sessions).toEqual([]);
      expect(result.interrupted_sessions).toEqual([]);
    });

    it("returns recent completed sessions", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/sessions/2024-01-15-session.md`,
        `---
type: session
tool: claude
outcome: Feature implemented
completed_at: "2024-01-15T10:00:00Z"
files_touched:
  - src/index.ts
tasks_completed:
  - task-001
---

# Session
`
      );

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_sessions).toHaveLength(1);
      expect(result.last_sessions[0].tool).toBe("claude");
      expect(result.last_sessions[0].outcome).toBe("Feature implemented");
      expect(result.last_sessions[0].files_touched).toContain("src/index.ts");
    });

    it("limits sessions to specified limit", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });

      for (let i = 1; i <= 10; i++) {
        await vaultFs.write(
          `projects/test-project/sessions/2024-01-${String(i).padStart(2, "0")}-session.md`,
          `---
type: session
tool: tool-${i}
outcome: Outcome ${i}
created: "2024-01-${String(i).padStart(2, "0")}"
---

# Session
`
        );
      }

      const result = await resumeCommand({
        project: "test-project",
        limit: 3,
      }, ctx);

      expect(result.last_sessions.length).toBeLessThanOrEqual(3);
    });

    it("returns active sessions for the project", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      await registry.register("claude", "test-project", "Active task", []);

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.active_sessions.length).toBeGreaterThanOrEqual(1);
      expect(result.active_sessions.some(s => s.project === "test-project")).toBe(true);
    });

    it("includes interrupted sessions", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      // Register and let it become stale (by not heartbeating)
      const { session_id } = await registry.register("claude", "test-project", "Interrupted task", []);

      // Manually mark as stale in registry
      await vaultFs.write(
        "coordination/session-registry.json",
        JSON.stringify({
          sessions: [
            {
              session_id,
              tool: "claude",
              project: "test-project",
              status: "stale",
              task_summary: "Interrupted task",
              files_touched: [],
              started_at: new Date().toISOString(),
              last_heartbeat: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
        })
      );

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.interrupted_sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("suggests next steps from interrupted sessions", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      // Create stale session
      await vaultFs.write(
        "coordination/session-registry.json",
        JSON.stringify({
          sessions: [
            {
              session_id: "test-stale-123",
              tool: "claude",
              project: "test-project",
              status: "stale",
              task_summary: "Interrupted task",
              files_touched: [],
              started_at: new Date().toISOString(),
              last_heartbeat: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
        })
      );

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.suggested_next_steps.length).toBeGreaterThan(0);
      expect(result.suggested_next_steps.some(s => s.includes("Interrupted"))).toBe(true);
    });

    it("suggests next steps from in-progress tasks", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/tasks"), { recursive: true });

      await vaultFs.write(
        "projects/test-project/tasks/task-001-in-progress.md",
        `---
type: task
status: in-progress
---

# In Progress Task
`
      );

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.suggested_next_steps.some(s => s.includes("In-progress task"))).toBe(true);
    });

    it("handles missing sessions directory gracefully", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await resumeCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_sessions).toEqual([]);
    });
  });

  describe("formatResumeContext", () => {
    it("formats context as markdown", () => {
      const ctx = {
        project: "test-project",
        last_sessions: [
          { tool: "claude", outcome: "Done", completed_at: "2024-01-15", files_touched: [], tasks_completed: [] },
        ],
        active_sessions: [],
        interrupted_sessions: [],
        suggested_next_steps: ["Review PR", "Fix tests"],
      };

      const result = formatResumeContext(ctx);

      expect(result).toContain("## Session Resume: test-project");
      expect(result).toContain("### Recent Sessions");
      expect(result).toContain("claude");
      expect(result).toContain("### Suggested Next Steps");
      expect(result).toContain("Review PR");
    });

    it("includes interrupted sessions section", () => {
      const ctx = {
        project: "test-project",
        last_sessions: [],
        active_sessions: [],
        interrupted_sessions: [
          {
            id: "stale-1",
            tool: "cursor",
            project: "test-project",
            status: "stale" as const,
            task_summary: "Interrupted work",
            files_touched: ["src/file.ts"],
            started_at: "2024-01-15T10:00:00Z",
            last_heartbeat: "2024-01-15T11:00:00Z",
            completed_at: null,
          },
        ],
        suggested_next_steps: [],
      };

      const result = formatResumeContext(ctx);

      expect(result).toContain("### Interrupted Sessions (stale)");
      expect(result).toContain("cursor");
      expect(result).toContain("Interrupted work");
    });

    it("includes active sessions section", () => {
      const ctx = {
        project: "test-project",
        last_sessions: [],
        active_sessions: [
          {
            id: "active-1",
            tool: "copilot",
            project: "test-project",
            status: "active" as const,
            task_summary: "Active work",
            files_touched: [],
            started_at: "2024-01-15T10:00:00Z",
            last_heartbeat: "2024-01-15T11:00:00Z",
            completed_at: null,
          },
        ],
        interrupted_sessions: [],
        suggested_next_steps: [],
      };

      const result = formatResumeContext(ctx);

      expect(result).toContain("### Active Sessions (other agents)");
      expect(result).toContain("copilot");
    });
  });
});
