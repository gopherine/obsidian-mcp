import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile as fspWriteFile, rm, readFile as fspReadFile, open } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SessionRegistryManager } from "./session-registry.js";

describe("SessionRegistryManager", () => {
  let vaultRoot: string;
  let manager: SessionRegistryManager;

  beforeEach(async () => {
    vaultRoot = join(tmpdir(), `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    manager = new SessionRegistryManager(vaultRoot, 1);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("register", () => {
    it("creates session with generated ID", async () => {
      const result = await manager.register("claude-code", "test-project");
      expect(result.session_id).toMatch(/^claude-code-[a-f0-9]{8}$/);
    });

    it("creates session with all fields", async () => {
      const result = await manager.register("opencode", "my-project", "Doing work", ["file1.ts", "file2.ts"]);
      expect(result.session_id).toMatch(/^opencode-/);
    });

    it("detects file conflicts", async () => {
      await manager.register("claude-code", "proj", "Task 1", ["a.ts", "b.ts"]);
      const result = await manager.register("opencode", "proj", "Task 2", ["b.ts", "c.ts"]);
      
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].overlapping_files).toContain("b.ts");
    });

    it("returns empty conflicts when no overlap", async () => {
      await manager.register("claude-code", "proj", "Task 1", ["a.ts"]);
      const result = await manager.register("opencode", "proj", "Task 2", ["b.ts"]);
      
      expect(result.conflicts).toEqual([]);
    });

    it("returns empty conflicts when first session has no files", async () => {
      await manager.register("claude-code", "proj", "Task 1", []);
      const result = await manager.register("opencode", "proj", "Task 2", ["b.ts"]);
      
      expect(result.conflicts).toEqual([]);
    });

    it("cleans stale sessions on register", async () => {
      const oldManager = new SessionRegistryManager(vaultRoot, 0);
      await oldManager.register("claude-code", "proj", "Old session");
      
      await new Promise(r => setTimeout(r, 10));
      
      const newManager = new SessionRegistryManager(vaultRoot, 0.000001);
      await newManager.register("opencode", "proj", "New session");
      
      const active = await newManager.listActive();
      expect(active.every(s => s.status === "active")).toBe(true);
    });

    it("persists session to registry file", async () => {
      await manager.register("claude-code", "test-project");
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      expect(parsed.sessions.length).toBe(1);
      expect(parsed.sessions[0].tool).toBe("claude-code");
    });
  });

  describe("heartbeat", () => {
    it("updates heartbeat timestamp", async () => {
      const { session_id } = await manager.register("claude-code", "proj");
      await new Promise(r => setTimeout(r, 10));
      
      const result = await manager.heartbeat(session_id);
      expect(result).toBe(true);
    });

    it("returns false for missing session", async () => {
      const result = await manager.heartbeat("nonexistent-id");
      expect(result).toBe(false);
    });

    it("persists heartbeat to file", async () => {
      const { session_id } = await manager.register("claude-code", "proj");
      await manager.heartbeat(session_id);
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      const session = parsed.sessions.find((s: any) => s.id === session_id);
      expect(session.last_heartbeat).toBeDefined();
    });
  });

  describe("complete", () => {
    it("marks session as completed", async () => {
      const { session_id } = await manager.register("claude-code", "proj");
      await manager.complete(session_id);
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      const session = parsed.sessions.find((s: any) => s.id === session_id);
      expect(session.status).toBe("completed");
      expect(session.completed_at).toBeDefined();
    });

    it("updates task summary when provided", async () => {
      const { session_id } = await manager.register("claude-code", "proj", "Old summary");
      await manager.complete(session_id, "New summary");
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      const session = parsed.sessions.find((s: any) => s.id === session_id);
      expect(session.task_summary).toBe("New summary");
    });

    it("removes old completed sessions", async () => {
      const { session_id } = await manager.register("claude-code", "proj");
      await manager.complete(session_id);
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      let raw = await fspReadFile(registryPath, "utf-8");
      let parsed = JSON.parse(raw);
      
      const session = parsed.sessions.find((s: any) => s.id === session_id);
      session.completed_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      
      await fspWriteFile(registryPath, JSON.stringify(parsed));
      
      await manager.register("opencode", "proj");
      
      raw = await fspReadFile(registryPath, "utf-8");
      parsed = JSON.parse(raw);
      
      expect(parsed.sessions.find((s: any) => s.id === session_id)).toBeUndefined();
    });
  });

  describe("listActive", () => {
    it("returns only active sessions", async () => {
      const { session_id } = await manager.register("claude-code", "proj");
      await manager.register("opencode", "proj2");
      await manager.complete(session_id);
      
      const active = await manager.listActive();
      expect(active.length).toBe(1);
      expect(active[0].tool).toBe("opencode");
    });

    it("returns empty array when no active sessions", async () => {
      const active = await manager.listActive();
      expect(active).toEqual([]);
    });

    it("persists stale status changes", async () => {
      const staleManager = new SessionRegistryManager(vaultRoot, 0.000001);
      await staleManager.register("claude-code", "proj");
      
      await new Promise(r => setTimeout(r, 20));
      
      const active = await staleManager.listActive();
      expect(active).toEqual([]);
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      expect(parsed.sessions[0].status).toBe("stale");
    });
  });

  describe("withLock", () => {
    it("prevents concurrent access", async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(manager.register(`tool-${i}`, "proj"));
      }
      
      const results = await Promise.all(promises);
      
      expect(results.every(r => r.session_id)).toBe(true);
      
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      const raw = await fspReadFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      
      expect(parsed.sessions.length).toBe(5);
    });

    it("removes stale locks", async () => {
      const locksDir = join(vaultRoot, "coordination/locks");
      await mkdir(locksDir, { recursive: true });
      
      const lockPath = join(locksDir, "session-registry.lock");
      await fspWriteFile(lockPath, JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString() }));
      
      const { session_id } = await manager.register("claude-code", "proj");
      expect(session_id).toBeDefined();
    });
  });

  describe("readRegistry validation", () => {
    it("handles malformed session entries", async () => {
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      await mkdir(join(vaultRoot, "coordination"), { recursive: true });
      
      const now = new Date().toISOString();
      const malformedData = {
        sessions: [
          { id: "valid-1", tool: "test", status: "active", started_at: now, last_heartbeat: now, files_touched: [] },
          { id: 123, tool: "bad" },
          null,
          "string not object",
          { id: "valid-2", tool: "test", status: "active", started_at: "bad-date", last_heartbeat: "2024-01-01T00:00:00Z", files_touched: [] },
        ]
      };
      
      await fspWriteFile(registryPath, JSON.stringify(malformedData));
      
      const active = await manager.listActive();
      
      const validIds = active.map(s => s.id);
      expect(validIds).toContain("valid-1");
      expect(validIds).not.toContain("valid-2");
    });

    it("handles non-array sessions field", async () => {
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      await mkdir(join(vaultRoot, "coordination"), { recursive: true });
      await fspWriteFile(registryPath, JSON.stringify({ sessions: "not-an-array" }));
      
      const active = await manager.listActive();
      expect(active).toEqual([]);
    });

    it("handles missing sessions field", async () => {
      const registryPath = join(vaultRoot, "coordination/session-registry.json");
      await mkdir(join(vaultRoot, "coordination"), { recursive: true });
      await fspWriteFile(registryPath, JSON.stringify({}));
      
      const active = await manager.listActive();
      expect(active).toEqual([]);
    });
  });
});


