import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { skillCommand, SkillCommandOptions } from "./index.js";
import { VaultFS } from "../../lib/vault-fs.js";
import type { InstallResult } from "./install.js";
import type { ListResult } from "./list.js";
import type { ValidateResult } from "./validate.js";

const validSkillContent = `---
name: test-skill
description: A test skill
version: "1.0.0"
---

# Test Skill
`;

describe("skillCommand", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-skill-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("install action", () => {
    it("requires source option", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "install" });
      expect(result.action).toBe("install");
      const r = result.result as InstallResult;
      expect(r.success).toBe(false);
      expect(r.error).toContain("Source is required");
    });

    it("installs from local file path", async () => {
      const skillPath = join(vaultRoot, "src", "skill.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, validSkillContent);

      const result = await skillCommand(vaultFs, vaultRoot, {
        action: "install",
        source: skillPath,
      });
      expect(result.action).toBe("install");
      const r = result.result as InstallResult;
      expect(r.success).toBe(true);
      expect(r.skill?.name).toBe("test-skill");
    });

    it("passes force flag to install", async () => {
      const skillPath = join(vaultRoot, "src", "skill.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, validSkillContent);

      const result1 = await skillCommand(vaultFs, vaultRoot, { action: "install", source: skillPath });
      expect((result1.result as InstallResult).success).toBe(true);

      const result2 = await skillCommand(vaultFs, vaultRoot, { action: "install", source: skillPath, force: true });
      expect((result2.result as InstallResult).success).toBe(true);
    });
  });

  describe("list action", () => {
    it("returns empty list when no skills installed", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "list" });
      expect(result.action).toBe("list");
      expect((result.result as ListResult).skills).toEqual([]);
    });

    it("returns installed skills", async () => {
      const skillPath = join(vaultRoot, "src", "skill.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, validSkillContent);

      await skillCommand(vaultFs, vaultRoot, { action: "install", source: skillPath });

      const result = await skillCommand(vaultFs, vaultRoot, { action: "list" });
      expect(result.action).toBe("list");
      const r = result.result as ListResult;
      expect(r.skills).toHaveLength(1);
      expect(r.skills[0].name).toBe("test-skill");
    });
  });

  describe("validate action", () => {
    it("requires skillPath option", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "validate" });
      expect(result.action).toBe("validate");
      const r = result.result as ValidateResult;
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain("Skill path is required");
    });

    it("validates a valid local skill file", async () => {
      const skillPath = join(vaultRoot, "src", "valid.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, validSkillContent);

      const result = await skillCommand(vaultFs, vaultRoot, { action: "validate", skillPath });
      expect(result.action).toBe("validate");
      const r = result.result as ValidateResult;
      expect(r.valid).toBe(true);
      expect(r.frontmatter?.name).toBe("test-skill");
    });

    it("reports errors for invalid skill file", async () => {
      const skillPath = join(vaultRoot, "src", "invalid.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, "---\n---\n\n# No frontmatter");

      const result = await skillCommand(vaultFs, vaultRoot, { action: "validate", skillPath });
      expect(result.action).toBe("validate");
      const r = result.result as ValidateResult;
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it("reports error for nonexistent file", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "validate", skillPath: "/nonexistent/skill.md" });
      expect(result.action).toBe("validate");
      const r = result.result as ValidateResult;
      expect(r.valid).toBe(false);
      expect(r.errors[0]).toContain("Failed to read file");
    });
  });

  describe("delete action", () => {
    it("requires skillName option", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "delete" });
      expect(result.action).toBe("delete");
      const r = result.result as InstallResult;
      expect(r.success).toBe(false);
      expect(r.error).toContain("Skill name is required");
    });

    it("fails when skill not found", async () => {
      const result = await skillCommand(vaultFs, vaultRoot, { action: "delete", skillName: "nonexistent" });
      expect(result.action).toBe("delete");
      const r = result.result as InstallResult;
      expect(r.success).toBe(false);
      expect(r.error).toContain("not found");
    });

    it("deletes an installed skill", async () => {
      const skillPath = join(vaultRoot, "src", "skill.md");
      await mkdir(join(vaultRoot, "src"), { recursive: true });
      await writeFile(skillPath, validSkillContent);

      await skillCommand(vaultFs, vaultRoot, { action: "install", source: skillPath });
      const result = await skillCommand(vaultFs, vaultRoot, { action: "delete", skillName: "test-skill" });
      expect(result.action).toBe("delete");
      expect((result.result as InstallResult).success).toBe(true);
    });
  });
});
