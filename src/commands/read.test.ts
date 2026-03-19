import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { readCommand, listCommand } from "./read.js";
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

describe("readCommand", () => {
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

  describe("readCommand", () => {
    it("reads existing file", async () => {
      await vaultFs.write("test.md", "content");
      const result = await readCommand({ path: "test.md" }, ctx);
      expect(result).toBe("content");
    });
  });

  describe("listCommand", () => {
    it("lists directory contents", async () => {
      await vaultFs.write("test.md", "content");
      await mkdir(join(vaultRoot, "subdir"));
        await vaultFs.write("subdir/child.md", "child");
        const result = await listCommand({ path: ".", depth: 2 }, ctx);
        expect(result).toContain("./test.md");
        expect(result).toContain("./subdir/child.md");
      });
  });
});
