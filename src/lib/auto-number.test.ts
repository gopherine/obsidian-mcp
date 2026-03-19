import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getNextNumber, slugify } from "./auto-number.js";
import { VaultFS } from "./vault-fs.js";

describe("auto-number", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;

  beforeEach(async () => {
    vaultRoot = join(tmpdir(), `autonumber-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("getNextNumber", () => {
    it("returns 1 for empty directory", async () => {
      await mkdir(join(vaultRoot, "empty"), { recursive: true });
      const result = await getNextNumber(vaultFs, "empty");
      expect(result).toBe(1);
    });

    it("returns 1 for non-existent directory", async () => {
      const result = await getNextNumber(vaultFs, "nonexistent");
      expect(result).toBe(1);
    });

    it("returns next number after existing files", async () => {
      await vaultFs.write("decisions/.keep", "");
      await vaultFs.write("decisions/001-first.md", "");
      await vaultFs.write("decisions/002-second.md", "");
      
      const result = await getNextNumber(vaultFs, "decisions");
      expect(result).toBe(3);
    });

    it("handles gaps in numbering", async () => {
      await vaultFs.write("tasks/.keep", "");
      await vaultFs.write("tasks/001-first.md", "");
      await vaultFs.write("tasks/005-fifth.md", "");
      
      const result = await getNextNumber(vaultFs, "tasks");
      expect(result).toBe(6);
    });

    it("ignores files without number prefix", async () => {
      await vaultFs.write("mixed/.keep", "");
      await vaultFs.write("mixed/001-numbered.md", "");
      await vaultFs.write("mixed/unnumbered.md", "");
      await vaultFs.write("mixed/README.md", "");
      
      const result = await getNextNumber(vaultFs, "mixed");
      expect(result).toBe(2);
    });

    it("handles single digit numbers", async () => {
      await vaultFs.write("single/.keep", "");
      await vaultFs.write("single/1-first.md", "");
      await vaultFs.write("single/5-fifth.md", "");
      
      const result = await getNextNumber(vaultFs, "single");
      expect(result).toBe(6);
    });

    it("handles three digit numbers", async () => {
      await vaultFs.write("triple/.keep", "");
      await vaultFs.write("triple/099-late.md", "");
      await vaultFs.write("triple/100-hundred.md", "");
      
      const result = await getNextNumber(vaultFs, "triple");
      expect(result).toBe(101);
    });
  });

  describe("slugify", () => {
    const cases = [
      { name: "simple title", input: "Hello World", expected: "hello-world" },
      { name: "spaces become dashes", input: "multiple   spaces", expected: "multiple-spaces" },
      { name: "special chars removed", input: "Hello! @World# $Test%", expected: "hello-world-test" },
      { name: "uppercase to lowercase", input: "UPPERCASE TITLE", expected: "uppercase-title" },
      { name: "mixed case", input: "MixedCase Title", expected: "mixedcase-title" },
      { name: "numbers preserved", input: "Task 123 Test", expected: "task-123-test" },
      { name: "dashes at start removed", input: "-start with dash", expected: "start-with-dash" },
      { name: "dashes at end removed", input: "end with dash-", expected: "end-with-dash" },
      { name: "multiple dashes collapsed", input: "a---b", expected: "a-b" },
      { name: "empty string", input: "", expected: "untitled" },
      { name: "only special chars", input: "!@#$%", expected: "untitled" },
      { name: "underscore preserved", input: "hello_world", expected: "hello_world" },
      { name: "dots removed", input: "file.name.md", expected: "file-name-md" },
    ];

    for (const c of cases) {
      it(c.name, () => {
        expect(slugify(c.input)).toBe(c.expected);
      });
    }
  });
});
