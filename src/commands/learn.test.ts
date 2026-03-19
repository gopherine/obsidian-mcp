import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { learnCommand } from "./learn.js";
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

describe("learnCommand", () => {
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

  describe("add learning", () => {
    it("creates new learning with auto-numbering", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      const result = await learnCommand({
        action: "add",
        title: "API Rate Limiting",
        discovery: "Rate limits reset at midnight UTC",
        project: "test-project",
      }, ctx);

      expect(result.learning_id).toBe("001");
      expect(result.path).toBe("projects/test-project/learnings/001-api-rate-limiting.md");

      const content = await vaultFs.read(result.path!);
      expect(content).toContain("type: learning");
      expect(content).toContain("# API Rate Limiting");
      expect(content).toContain("Rate limits reset at midnight UTC");
    });

    it("increments number for subsequent learnings", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      const result1 = await learnCommand({
        action: "add",
        title: "First Learning",
        discovery: "Discovery 1",
        project: "test-project",
      }, ctx);

      const result2 = await learnCommand({
        action: "add",
        title: "Second Learning",
        discovery: "Discovery 2",
        project: "test-project",
      }, ctx);

      expect(result1.learning_id).toBe("001");
      expect(result2.learning_id).toBe("002");
    });

    it("sets default confidence to medium", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "Test",
        discovery: "Discovery",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/learnings/001-test.md");
      expect(content).toContain("confidence: medium");
    });

    it("accepts high confidence", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "High Confidence",
        discovery: "Verified",
        confidence: "high",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/learnings/001-high-confidence.md");
      expect(content).toContain("confidence: high");
    });

    it("accepts low confidence", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "Low Confidence",
        discovery: "Unverified",
        confidence: "low",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/learnings/001-low-confidence.md");
      expect(content).toContain("confidence: low");
    });

    it("rejects invalid confidence", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await expect(
        learnCommand({
          action: "add",
          title: "Test",
          discovery: "Test",
          confidence: "invalid" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow('Invalid confidence "invalid"');
    });

    it("requires title for add", async () => {
      await expect(
        learnCommand({
          action: "add",
          discovery: "Test",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Title required for add");
    });

    it("requires discovery for add", async () => {
      await expect(
        learnCommand({
          action: "add",
          title: "Test",
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Discovery required for add");
    });

    it("stores tags in frontmatter", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "Tagged Learning",
        discovery: "Content",
        tags: ["api", "performance"],
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/learnings/001-tagged-learning.md");
      expect(content).toContain("tags:");
      expect(content).toContain("- api");
      expect(content).toContain("- performance");
    });

    it("stores source and session_id", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "Sourced Learning",
        discovery: "Content",
        source: "PR #123",
        sessionId: "session-abc123",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read("projects/test-project/learnings/001-sourced-learning.md");
      expect(content).toMatch(/source:\s*'?PR #123'?/);
      expect(content).toContain("session_id: session-abc123");
    });
  });

  describe("list learnings", () => {
    it("returns empty array when no learnings", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      const result = await learnCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.learnings).toEqual([]);
    });

    it("lists all learnings", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "Learning 1",
        discovery: "Discovery 1",
        tags: ["api"],
        project: "test-project",
      }, ctx);

      await learnCommand({
        action: "add",
        title: "Learning 2",
        discovery: "Discovery 2",
        tags: ["database"],
        confidence: "high",
        project: "test-project",
      }, ctx);

      const result = await learnCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.learnings).toHaveLength(2);
      expect(result.learnings![0].id).toBe("001");
      expect(result.learnings![0].title).toBe("Learning 1");
      expect(result.learnings![0].tags).toEqual(["api"]);
      expect(result.learnings![1].id).toBe("002");
      expect(result.learnings![1].confidence).toBe("high");
    });

    it("filters by tag", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });

      await learnCommand({
        action: "add",
        title: "API Learning",
        discovery: "Discovery",
        tags: ["api"],
        project: "test-project",
      }, ctx);

      await learnCommand({
        action: "add",
        title: "DB Learning",
        discovery: "Discovery",
        tags: ["database"],
        project: "test-project",
      }, ctx);

      const result = await learnCommand({
        action: "list",
        tag: "api",
        project: "test-project",
      }, ctx);

      expect(result.learnings).toHaveLength(1);
      expect(result.learnings![0].title).toBe("API Learning");
    });

    it("returns empty when learnings directory does not exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await learnCommand({
        action: "list",
        project: "test-project",
      }, ctx);

      expect(result.learnings).toEqual([]);
    });
  });

  describe("unknown action", () => {
    it("throws error for unknown action", async () => {
      await expect(
        learnCommand({
          action: "unknown" as any,
          project: "test-project",
        }, ctx)
      ).rejects.toThrow("Unknown action: unknown");
    });
  });
});
