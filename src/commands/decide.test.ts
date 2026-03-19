import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { decideCommand } from "./decide.js";
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

describe("decideCommand", () => {
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

  describe("create ADR", () => {
    it("creates ADR with auto-numbering", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/decisions"), { recursive: true });

      const result = await decideCommand({
        title: "Use TypeScript",
        context: "We need type safety",
        decision: "Adopt TypeScript for all new code",
        project: "test-project",
      }, ctx);

      expect(result.decision_number).toBe(1);
      expect(result.path).toBe("projects/test-project/decisions/001-use-typescript.md");

      const content = await vaultFs.read(result.path);
      expect(content).toContain("type: adr");
      expect(content).toContain("project: test-project");
      expect(content).toContain("status: active");
      expect(content).toContain("# ADR-001: Use TypeScript");
      expect(content).toContain("We need type safety");
      expect(content).toContain("Adopt TypeScript for all new code");
    });

    it("increments ADR number for subsequent decisions", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/decisions"), { recursive: true });

      const result1 = await decideCommand({
        title: "First Decision",
        context: "Context 1",
        decision: "Decision 1",
        project: "test-project",
      }, ctx);

      const result2 = await decideCommand({
        title: "Second Decision",
        context: "Context 2",
        decision: "Decision 2",
        project: "test-project",
      }, ctx);

      expect(result1.decision_number).toBe(1);
      expect(result2.decision_number).toBe(2);
    });

    it("includes alternatives and consequences when provided", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/decisions"), { recursive: true });

      const result = await decideCommand({
        title: "Database Choice",
        context: "Need a database",
        decision: "Use PostgreSQL",
        alternatives: "Considered MySQL and MongoDB",
        consequences: "Requires DevOps expertise",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read(result.path);
      expect(content).toContain("Considered MySQL and MongoDB");
      expect(content).toContain("Requires DevOps expertise");
    });

    it("uses defaults for missing alternatives and consequences", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/decisions"), { recursive: true });

      const result = await decideCommand({
        title: "Simple Decision",
        context: "Simple context",
        decision: "Simple decision",
        project: "test-project",
      }, ctx);

      const content = await vaultFs.read(result.path);
      expect(content).toContain("None documented.");
      expect(content).toContain("To be evaluated.");
    });

    it("slugifies title correctly", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/decisions"), { recursive: true });

      const result = await decideCommand({
        title: "Use React & TypeScript!",
        context: "Context",
        decision: "Decision",
        project: "test-project",
      }, ctx);

      expect(result.path).toContain("use-react-typescript");
    });
  });
});
