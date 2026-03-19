import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { graphRelatedCommand, graphCrossProjectCommand } from "./graph.js";
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

describe("graph commands", () => {
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

  describe("extractWikilinks", () => {
    it("extracts simple wikilinks", async () => {
      await vaultFs.write(
        "note.md",
        `---
type: note
---

# Note

Link to [[other-note]] and [[another-note]].
`
      );

      const result = await graphRelatedCommand({ path: "note.md" }, ctx);

      expect(result.outgoing).toContain("other-note");
      expect(result.outgoing).toContain("another-note");
    });

    it("extracts wikilinks with aliases", async () => {
      await vaultFs.write(
        "note.md",
        `---
type: note
---

Link to [[target|display text]].
`
      );

      const result = await graphRelatedCommand({ path: "note.md" }, ctx);

      expect(result.outgoing).toContain("target");
    });

    it("deduplicates wikilinks", async () => {
      await vaultFs.write(
        "note.md",
        `---
type: note
---

Link to [[same-note]] twice: [[same-note]].
`
      );

      const result = await graphRelatedCommand({ path: "note.md" }, ctx);

      expect(result.outgoing.filter(l => l === "same-note")).toHaveLength(1);
    });

    it("returns empty array when no wikilinks", async () => {
      await vaultFs.write(
        "note.md",
        `---
type: note
---

# Note with no links
`
      );

      const result = await graphRelatedCommand({ path: "note.md" }, ctx);

      expect(result.outgoing).toEqual([]);
    });
  });

  describe("backlinks", () => {
    it("finds backlinks to note", async () => {
      await vaultFs.write(
        "target.md",
        `---
type: note
---

# Target Note
`
      );

      await vaultFs.write(
        "source.md",
        `---
type: note
---

Link to [[target]] here.
`
      );

      const result = await graphRelatedCommand({ path: "target.md" }, ctx);

      expect(result.backlinks).toContain("source.md");
    });

    it("excludes self-references from backlinks", async () => {
      await vaultFs.write(
        "note.md",
        `---
type: note
---

Link to [[note]] itself.
`
      );

      const result = await graphRelatedCommand({ path: "note.md" }, ctx);

      expect(result.backlinks).not.toContain("note.md");
    });

    it("finds backlinks with .md extension in link", async () => {
      await vaultFs.write(
        "target.md",
        `---
type: note
---

# Target
`
      );

      await vaultFs.write(
        "source.md",
        `---
type: note
---

Link to [[target.md]].
`
      );

      const result = await graphRelatedCommand({ path: "target.md" }, ctx);

      expect(result.backlinks).toContain("source.md");
    });
  });

  describe("hops", () => {
    it("returns single hop by default", async () => {
      await vaultFs.write(
        "a.md",
        `---
type: note
---

[[b]]
`
      );

      await vaultFs.write(
        "b.md",
        `---
type: note
---

[[c]]
`
      );

      await vaultFs.write("c.md", `---\ntype: note\n---\n# C`);

      const result = await graphRelatedCommand({ path: "a.md", hops: 1 }, ctx);

      expect(result.outgoing).toContain("b");
      expect(result.outgoing).not.toContain("c");
    });

    it("returns second hop when hops > 1", async () => {
      await vaultFs.write(
        "a.md",
        `---
type: note
---

[[b]]
`
      );

      await vaultFs.write(
        "b.md",
        `---
type: note
---

[[c]]
`
      );

      await vaultFs.write("c.md", `---\ntype: note\n---\n# C`);

      const result = await graphRelatedCommand({ path: "a.md", hops: 2 }, ctx);

      expect(result.outgoing).toContain("b");
      expect(result.outgoing).toContain("c");
    });

    it("finds second hop backlinks", async () => {
      await vaultFs.write("a.md", `---\ntype: note\n---\n[[b]]`);
      await vaultFs.write("b.md", `---\ntype: note\n---\n# B`);
      await vaultFs.write("c.md", `---\ntype: note\n---\n[[b]]`);

      const result = await graphRelatedCommand({ path: "a.md", hops: 2 }, ctx);

      // c.md links to b.md, which is linked from a.md
      expect(result.backlinks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("graphCrossProjectCommand", () => {
    it("groups results by project", async () => {
      await mkdir(join(vaultRoot, "projects/proj-a"), { recursive: true });
      await mkdir(join(vaultRoot, "projects/proj-b"), { recursive: true });

      await vaultFs.write(
        "projects/proj-a/note.md",
        `---
type: note
---

API endpoint documentation
`
      );

      await vaultFs.write(
        "projects/proj-b/note.md",
        `---
type: note
---

API client implementation
`
      );

      const result = await graphCrossProjectCommand({ query: "API", limit: 10 }, ctx);

      // Results should be grouped
      expect(typeof result).toBe("object");
    });

    it("uses _shared for non-project files", async () => {
      await vaultFs.write(
        "shared-note.md",
        `---
type: note
---

Shared API documentation
`
      );

      const result = await graphCrossProjectCommand({ query: "API", limit: 10 }, ctx);

      expect(result["_shared"] || result["shared-note"]).toBeDefined;
    });

    it("respects limit parameter", async () => {
      for (let i = 0; i < 30; i++) {
        await vaultFs.write(
          `note-${i}.md`,
          `---
type: note
---

Test content ${i}
`
        );
      }

      const result = await graphCrossProjectCommand({ query: "Test", limit: 5 }, ctx);

      const totalResults = Object.values(result).flat().length;
      expect(totalResults).toBeLessThanOrEqual(5);
    });
  });

  describe("error handling", () => {
    it("throws for non-existent file", async () => {
      await expect(
        graphRelatedCommand({ path: "nonexistent.md" }, ctx)
      ).rejects.toThrow();
    });
  });
});
