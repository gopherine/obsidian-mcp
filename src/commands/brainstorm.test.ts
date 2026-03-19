import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { brainstormCommand } from "./brainstorm.js";
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

describe("brainstormCommand", () => {
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

  describe("create new brainstorm", () => {
    it("creates new brainstorm file with frontmatter", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/brainstorms"), { recursive: true });

      const result = await brainstormCommand({
        topic: "My Brainstorm",
        content: "First idea",
        project: "test-project",
      }, ctx);

      expect(result.path).toBe("projects/test-project/brainstorms/my-brainstorm.md");
      expect(result.total_entries).toBe(1);

      const content = await vaultFs.read(result.path);
      expect(content).toContain("type: brainstorm");
      expect(content).toContain("project: test-project");
      expect(content).toContain("# My Brainstorm");
      expect(content).toContain("First idea");
    });

    it("creates frontmatter with draft status", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/brainstorms"), { recursive: true });

      const result = await brainstormCommand({
        topic: "Test Topic",
        content: "content",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read(result.path);
      expect(content).toContain("status: draft");
    });

    it("slugifies topic with special characters", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/brainstorms"), { recursive: true });

      const result = await brainstormCommand({
        topic: "My Special Topic! @#$",
        content: "content",
        project: "test-project",
      }, ctx);

      expect(result.path).toContain("my-special-topic");
    });
  });

  describe("append to existing brainstorm", () => {
    it("appends new entry to existing brainstorm", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/brainstorms"), { recursive: true });

      await brainstormCommand({
        topic: "Existing Topic",
        content: "First entry",
        project: "test-project",
      }, ctx);

      const result = await brainstormCommand({
        topic: "Existing Topic",
        content: "Second entry",
        project: "test-project",
      }, ctx);

      expect(result.total_entries).toBe(2);

      const content = await vaultFs.read(result.path);
      expect(content).toContain("First entry");
      expect(content).toContain("Second entry");
    });

    it("counts entries correctly after multiple appends", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/brainstorms"), { recursive: true });

      await brainstormCommand({
        topic: "Multi Entry",
        content: "Entry 1",
        project: "test-project",
      }, ctx);

      await brainstormCommand({
        topic: "Multi Entry",
        content: "Entry 2",
        project: "test-project",
      }, ctx);

      const result = await brainstormCommand({
        topic: "Multi Entry",
        content: "Entry 3",
        project: "test-project",
      }, ctx);

      expect(result.total_entries).toBe(3);
    });
  });
});
