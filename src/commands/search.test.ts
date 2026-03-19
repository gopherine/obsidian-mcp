import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { searchCommand } from "./search.js";

import { searchText, searchStructured } from "../lib/search-engine.js";
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

describe("searchCommand", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;
  let ctx: CommandContext;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
    ctx = createCommandContext(vaultFs);
    await mkdir(join(vaultRoot, "projects/test"), { recursive: true });
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("text search", () => {
    it("performs text search", async () => {
      await writeFile(join(vaultRoot, "projects/test/note.md"), "# Test Note\n\nSearchable content here");
      const results = await searchCommand({ query: "Searchable", limit: 10 }, ctx);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toContain("note.md");
    });

    it("filters by project path", async () => {
      await mkdir(join(vaultRoot, "projects/other"), { recursive: true });
      await writeFile(join(vaultRoot, "projects/test/note.md"), "Searchable content");
      await writeFile(join(vaultRoot, "projects/other/note.md"), "Searchable content");
      const results = await searchCommand({ query: "Searchable", project: "test", limit: 10 }, ctx);
      expect(results.every((r) => r.path.includes("test"))).toBe(true);
    });
  });

  describe("structured search", () => {
    it("performs structured search", async () => {
      await writeFile(
        join(vaultRoot, "projects/test/doc.md"),
        "---\ntype: adr\nstatus: active\n---\n\nContent"
      );
      const results = await searchCommand({ query: "type:adr status:active", structured: true, limit: 10 }, ctx);
      expect(results.length).toBeGreaterThan(0);
    });

    it("includes project filter in structured search", async () => {
      await mkdir(join(vaultRoot, "projects/other"), { recursive: true });
      await writeFile(
        join(vaultRoot, "projects/test/doc.md"),
        "---\ntype: adr\nstatus: active\n---\n\nContent"
      );
      await writeFile(
        join(vaultRoot, "projects/other/doc.md"),
        "---\ntype: adr\nstatus: active\n---\n\nContent"
      );
      const results = await searchCommand({ query: "type:adr", structured: true, project: "test", limit: 10 }, ctx);
      expect(results.every((r) => r.path.includes("test"))).toBe(true);
    });
  });
});

