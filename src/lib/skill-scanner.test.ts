// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, writeFile, rm } from "fs/promises";
import {
  scanInstalledSkills,
  getSkillDirectories,
  scannedSkillsToRegistryFormat,
  _setSkillDirectories,
  _resetSkillDirectories,
} from "./skill-scanner.js";

describe("skill-scanner", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `skill-scanner-test-${process.pid}-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    _resetSkillDirectories();
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  function writeSkill(dir: string, name: string, description: string, extra = ""): Promise<void> {
    return writeFile(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\nSkill content here.`,
      "utf-8",
    );
  }

  describe("getSkillDirectories", () => {
    it("returns global directories", () => {
      const dirs = getSkillDirectories();
      expect(dirs.length).toBeGreaterThanOrEqual(5);
      expect(dirs.some((d) => d.source_tool === "claude" && d.scope === "global")).toBe(true);
      expect(dirs.some((d) => d.source_tool === "cursor" && d.scope === "global")).toBe(true);
    });

    it("includes project directories when projectDir provided", () => {
      const dirs = getSkillDirectories("/tmp/my-project");
      const projectDirs = dirs.filter((d) => d.scope === "project");
      expect(projectDirs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("scanInstalledSkills", () => {
    it("discovers SKILL.md files in scan directories", async () => {
      const skillDir = join(testDir, "skills", "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeSkill(skillDir, "my-skill", "A test skill for testing");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("my-skill");
      expect(result.skills[0].description).toBe("A test skill for testing");
      expect(result.skills[0].scope).toBe("global");
      expect(result.skills[0].source_tool).toBe("claude");
    });

    it("finds nested SKILL.md files", async () => {
      const nested = join(testDir, "skills", "repo", "skills", "deep-skill");
      await mkdir(nested, { recursive: true });
      await writeSkill(nested, "deep-skill", "Deeply nested skill");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("deep-skill");
    });

    it("extracts triggers from name and description", async () => {
      const skillDir = join(testDir, "skills", "tdd-workflow");
      await mkdir(skillDir, { recursive: true });
      await writeSkill(skillDir, "tdd-workflow", "Test-driven development with red green refactor");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills[0].triggers).toContain("tdd-workflow");
      expect(result.skills[0].triggers).toContain("test-driven");
      expect(result.skills[0].triggers).toContain("development");
    });

    it("extracts version from metadata", async () => {
      const skillDir = join(testDir, "skills", "versioned");
      await mkdir(skillDir, { recursive: true });
      await writeSkill(skillDir, "versioned", "A versioned skill", "metadata:\n  version: 2.1.0\n");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills[0].version).toBe("2.1.0");
    });

    it("extracts tags", async () => {
      const skillDir = join(testDir, "skills", "tagged");
      await mkdir(skillDir, { recursive: true });
      await writeSkill(skillDir, "tagged", "A tagged skill", "tags:\n  - testing\n  - go\n");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills[0].tags).toEqual(["testing", "go"]);
    });

    it("skips files without required frontmatter", async () => {
      const skillDir = join(testDir, "skills", "bad");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# No frontmatter\n\nJust content.", "utf-8");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(0);
    });

    it("skips files missing description", async () => {
      const skillDir = join(testDir, "skills", "no-desc");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: no-desc\n---\n\n# No desc", "utf-8");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(0);
    });

    it("deduplicates by name — project overrides global", async () => {
      const globalDir = join(testDir, "global", "my-skill");
      const projectDir = join(testDir, "project", "my-skill");
      await mkdir(globalDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await writeSkill(globalDir, "my-skill", "Global version");
      await writeSkill(projectDir, "my-skill", "Project version");

      _setSkillDirectories([
        { path: join(testDir, "global"), scope: "global", source_tool: "claude" },
        { path: join(testDir, "project"), scope: "project", source_tool: "claude" },
      ]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].description).toBe("Project version");
      expect(result.skills[0].scope).toBe("project");
    });

    it("handles nonexistent directories gracefully", async () => {
      _setSkillDirectories([
        { path: join(testDir, "nonexistent"), scope: "global", source_tool: "claude" },
      ]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("scans multiple directories", async () => {
      const claudeDir = join(testDir, "claude", "skill-a");
      const cursorDir = join(testDir, "cursor", "skill-b");
      await mkdir(claudeDir, { recursive: true });
      await mkdir(cursorDir, { recursive: true });
      await writeSkill(claudeDir, "skill-a", "Claude skill");
      await writeSkill(cursorDir, "skill-b", "Cursor skill");

      _setSkillDirectories([
        { path: join(testDir, "claude"), scope: "global", source_tool: "claude" },
        { path: join(testDir, "cursor"), scope: "global", source_tool: "cursor" },
      ]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.source_tool)).toContain("claude");
      expect(result.skills.map((s) => s.source_tool)).toContain("cursor");
    });

    it("records scan paths", async () => {
      _setSkillDirectories([
        { path: join(testDir, "a"), scope: "global", source_tool: "claude" },
        { path: join(testDir, "b"), scope: "global", source_tool: "cursor" },
      ]);

      const result = await scanInstalledSkills();
      expect(result.scan_paths).toHaveLength(2);
    });

    it("skips node_modules directories", async () => {
      const nmDir = join(testDir, "skills", "node_modules", "pkg");
      await mkdir(nmDir, { recursive: true });
      await writeSkill(nmDir, "hidden", "Should not be found");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      expect(result.skills).toHaveLength(0);
    });
  });

  describe("scannedSkillsToRegistryFormat", () => {
    it("converts scanned skills to registry format", async () => {
      const skillDir = join(testDir, "skills", "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeSkill(skillDir, "my-skill", "A great test skill");

      _setSkillDirectories([{ path: join(testDir, "skills"), scope: "global", source_tool: "claude" }]);

      const result = await scanInstalledSkills();
      const registry = scannedSkillsToRegistryFormat(result.skills);

      expect(registry).toHaveLength(1);
      expect(registry[0].id).toBe("local/my-skill");
      expect(registry[0].source).toBe("local");
      expect(registry[0].triggers.length).toBeGreaterThan(0);
    });
  });

  describe("real installed skills", () => {
    it("can scan actual ~/.claude/skills/ directory", async () => {
      // This test uses real disk — no mock
      _resetSkillDirectories();
      const result = await scanInstalledSkills();
      // We know at least taste-skill and bencium are installed
      const names = result.skills.map((s) => s.name);
      if (names.length > 0) {
        // At least one skill has required fields
        for (const skill of result.skills) {
          expect(skill.name).toBeTruthy();
          expect(skill.description).toBeTruthy();
          expect(skill.triggers.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
