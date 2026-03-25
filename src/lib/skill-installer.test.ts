// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, writeFile, rm, readFile } from "fs/promises";
import {
  parseSource,
  installSkills,
  removeSkill,
  listInstalledSkills,
  _setInstallDir,
  _resetInstallDir,
} from "./skill-installer.js";

describe("skill-installer", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `skill-installer-test-${process.pid}-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    _setInstallDir(testDir);
  });

  afterEach(async () => {
    _resetInstallDir();
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("parseSource", () => {
    it("parses owner/repo shorthand", () => {
      const result = parseSource("anthropics/skills");
      expect(result).not.toBeNull();
      expect(result!.owner).toBe("anthropics");
      expect(result!.repo).toBe("skills");
      expect(result!.repoUrl).toBe("https://github.com/anthropics/skills.git");
    });

    it("parses owner/repo with subpath", () => {
      const result = parseSource("anthropics/skills/claude-api");
      expect(result!.owner).toBe("anthropics");
      expect(result!.repo).toBe("skills");
      expect(result!.subpath).toBe("claude-api");
    });

    it("parses full GitHub URL", () => {
      const result = parseSource("https://github.com/obra/superpowers");
      expect(result!.owner).toBe("obra");
      expect(result!.repo).toBe("superpowers");
      expect(result!.repoUrl).toBe("https://github.com/obra/superpowers.git");
    });

    it("parses GitHub URL with .git suffix", () => {
      const result = parseSource("https://github.com/obra/superpowers.git");
      expect(result!.repo).toBe("superpowers");
    });

    it("parses GitHub URL with branch and subpath", () => {
      const result = parseSource("https://github.com/obra/superpowers/tree/main/skills/brainstorming");
      expect(result!.owner).toBe("obra");
      expect(result!.repo).toBe("superpowers");
      expect(result!.ref).toBe("main");
      expect(result!.subpath).toBe("skills/brainstorming");
    });

    it("parses github: prefix", () => {
      const result = parseSource("github:anthropics/skills");
      expect(result!.owner).toBe("anthropics");
      expect(result!.repo).toBe("skills");
    });

    it("returns null for invalid source", () => {
      expect(parseSource("not-a-valid-source")).toBeNull();
      expect(parseSource("")).toBeNull();
    });

    it("strips trailing slash", () => {
      const result = parseSource("anthropics/skills/");
      expect(result!.repo).toBe("skills");
      expect(result!.subpath).toBeUndefined();
    });
  });

  describe("installSkills", () => {
    it("returns error for invalid source", async () => {
      const result = await installSkills("not-valid");
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("Invalid source");
    });

    it("installs skills from a real public repo", async () => {
      // Use taste-skill — small, single SKILL.md, public
      const result = await installSkills("Leonxlnx/taste-skill");

      expect(result.success).toBe(true);
      expect(result.installed.length).toBeGreaterThan(0);

      // Verify file was copied
      const name = result.installed[0];
      const skillFile = join(testDir, name, "SKILL.md");
      const content = await readFile(skillFile, "utf-8");
      expect(content).toContain("name:");
    }, 30_000);
  });

  describe("removeSkill", () => {
    it("removes an installed skill", async () => {
      const skillDir = join(testDir, "test-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: test-skill\ndescription: Test\n---\n# Test", "utf-8");

      const result = await removeSkill("test-skill");
      expect(result.success).toBe(true);
    });

    it("returns error for nonexistent skill", async () => {
      const result = await removeSkill("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("listInstalledSkills", () => {
    it("lists skills with SKILL.md at root", async () => {
      const skillDir = join(testDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: my-skill\ndescription: A great skill\n---\n# My Skill",
        "utf-8",
      );

      const skills = await listInstalledSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("my-skill");
      expect(skills[0].description).toBe("A great skill");
    });

    it("lists skills with nested SKILL.md", async () => {
      const skillDir = join(testDir, "nested-skill", "skills", "nested-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: nested-skill\ndescription: Nested\n---\n# Nested",
        "utf-8",
      );

      const skills = await listInstalledSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("nested-skill");
    });

    it("skips learned directory", async () => {
      await mkdir(join(testDir, "learned"), { recursive: true });
      const skills = await listInstalledSkills();
      expect(skills).toHaveLength(0);
    });

    it("returns empty for nonexistent install dir", async () => {
      _setInstallDir(join(testDir, "nonexistent"));
      const skills = await listInstalledSkills();
      expect(skills).toEqual([]);
    });
  });
});
