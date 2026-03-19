import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { validateSkill } from "./validate.js";

describe("validateSkill", () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-skill-validate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("valid skill files", () => {
    const cases = [
      {
        name: "minimal valid frontmatter",
        content: "---\nname: my-skill\ndescription: Does something\n---\n\n# My Skill",
        expectedName: "my-skill",
        expectedDesc: "Does something",
      },
      {
        name: "full frontmatter with all optional fields",
        content: `---
name: full-skill
description: Full skill with all fields
version: "2.1.0"
author: test-author
tags:
  - category
  - utility
depends_on:
  - base-skill
---

# Full Skill
`,
        expectedName: "full-skill",
        expectedVersion: "2.1.0",
      },
      {
        name: "frontmatter with body content",
        content: "---\nname: body-skill\ndescription: Has body\n---\n\nSome body content here",
        expectedName: "body-skill",
      },
    ];

    for (const { name, content, expectedName, expectedDesc, expectedVersion } of cases) {
      it(name, async () => {
        const skillPath = join(vaultRoot, "skill.md");
        await writeFile(skillPath, content);

        const result = await validateSkill({ skillPath });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.frontmatter?.name).toBe(expectedName);
        if (expectedDesc) expect(result.frontmatter?.description).toBe(expectedDesc);
        if (expectedVersion) expect(result.frontmatter?.version).toBe(expectedVersion);
      });
    }
  });

  describe("invalid skill files", () => {
    const cases = [
      {
        name: "missing name field",
        content: "---\ndescription: No name\n---\n\n# Skill",
        expectedError: "name",
      },
      {
        name: "missing description field",
        content: "---\nname: no-desc\n---\n\n# Skill",
        expectedError: "description",
      },
      {
        name: "empty frontmatter",
        content: "---\n---\n\n# Skill",
        expectedErrorCount: 2,
      },
      {
        name: "no frontmatter at all",
        content: "# Just a heading\n\nNo frontmatter here",
        expectedErrorCount: 2,
      },
      {
        name: "non-string version",
        content: "---\nname: bad-ver\ndescription: Test\nversion: 123\n---\n\n# Skill",
        expectedError: "version",
      },
      {
        name: "non-string author",
        content: "---\nname: bad-author\ndescription: Test\nauthor: 42\n---\n\n# Skill",
        expectedError: "author",
      },
      {
        name: "non-array tags",
        content: "---\nname: bad-tags\ndescription: Test\ntags: not-array\n---\n\n# Skill",
        expectedError: "tags",
      },
      {
        name: "non-string array tags",
        content: "---\nname: bad-tags2\ndescription: Test\ntags: [1, 2]\n---\n\n# Skill",
        expectedError: "tags",
      },
      {
        name: "non-array depends_on",
        content: "---\nname: bad-deps\ndescription: Test\ndepends_on: string-val\n---\n\n# Skill",
        expectedError: "depends_on",
      },
    ];

    for (const { name, content, expectedError, expectedErrorCount } of cases) {
      it(name, async () => {
        const skillPath = join(vaultRoot, "invalid.md");
        await writeFile(skillPath, content);

        const result = await validateSkill({ skillPath });
        expect(result.valid).toBe(false);
        if (expectedError) {
          expect(result.errors.some((e) => e.includes(expectedError))).toBe(true);
        }
        if (expectedErrorCount) {
          expect(result.errors.length).toBe(expectedErrorCount);
        }
        expect(result.frontmatter).toBeUndefined();
      });
    }
  });

  describe("file read errors", () => {
    it("returns error for nonexistent file", async () => {
      const result = await validateSkill({ skillPath: "/nonexistent/path/skill.md" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to read file");
    });
  });

  describe("URL sources", () => {
    it("validates skill from URL", async () => {
      const mockContent = "---\nname: url-skill\ndescription: From URL\n---\n\n# URL Skill";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent),
      }));

      const result = await validateSkill({ skillPath: "https://example.com/skill.md" });
      expect(result.valid).toBe(true);
      expect(result.frontmatter?.name).toBe("url-skill");

      vi.unstubAllGlobals();
    });

    it("returns error when fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }));

      const result = await validateSkill({ skillPath: "https://example.com/missing.md" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to fetch");

      vi.unstubAllGlobals();
    });

    it("returns error when fetch throws", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const result = await validateSkill({ skillPath: "https://example.com/error.md" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to read file");

      vi.unstubAllGlobals();
    });

    it("does not treat non-http paths as URLs", async () => {
      const result = await validateSkill({ skillPath: "/local/path.md" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to read file");
    });
  });
});
