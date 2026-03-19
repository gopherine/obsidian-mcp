import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { writeCommand } from "./write.js";
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

describe("writeCommand", () => {
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

  describe("append mode (default)", () => {
    it("creates new file with frontmatter", async () => {
    const result = await writeCommand({ path: "new.md", content: "content", mode: "append" }, ctx);
    expect(result.written).toBe(true);
    expect(result.path).toBe("new.md");
    const content = await vaultFs.read("new.md");
    expect(content).toContain("content");
  });

  it("appends to existing file", async () => {
    await vaultFs.write("existing.md", "---\ncreated: 2024-01-01\n---\n\nInitial content");
    const result = await writeCommand({ path: "existing.md", content: "appended", mode: "append" }, ctx);
    expect(result.written).toBe(true);
    const content = await vaultFs.read("existing.md");
    expect(content).toContain("Initial content");
    expect(content).toContain("appended");
  });

  it("merges frontmatter on append", async () => {
    await vaultFs.write("fm.md", "---\ntags: [a]\n---\n\nBody");
    const result = await writeCommand({ path: "fm.md", content: "new content", mode: "append", frontmatter: { status: "new-status" } }, ctx);
    const content = await vaultFs.read("fm.md");
    expect(content).toContain("status: new-status");
  });
  });

  describe("prepend mode", () => {
    it("prepends content to existing file", async () => {
    await vaultFs.write("prepend.md", "---\ntitle: Test\n---\n\nOriginal body");
    const result = await writeCommand({ path: "prepend.md", content: "New top content", mode: "prepend" }, ctx);
    expect(result.written).toBe(true);
    const content = await vaultFs.read("prepend.md");
    expect(content).toContain("New top content");
    expect(content).toContain("Original body");
  });
  });

  describe("overwrite mode", () => {
    it("creates file with frontmatter", async () => {
    const result = await writeCommand({ path: "overwrite.md", content: "content", mode: "overwrite" }, ctx);
    expect(result.written).toBe(true);
    const content = await vaultFs.read("overwrite.md");
    expect(content).toContain("content");
  });

  it("creates file with custom frontmatter", async () => {
    const result = await writeCommand({ path: "custom.md", content: "content", mode: "overwrite", frontmatter: { priority: "high", tags: ["test"] } }, ctx);
    expect(result.written).toBe(true);
    const content = await vaultFs.read("custom.md");
    expect(content).toContain("priority: high");
    expect(content).toContain("tags:");
  });
  });
});
