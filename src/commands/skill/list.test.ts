import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { listSkills } from "./list.js";
import { SkillRegistryManager } from "../../lib/skill-registry.js";

describe("listSkills", () => {
  let vaultRoot: string;
  let registryManager: SkillRegistryManager;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-skill-list-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    registryManager = new SkillRegistryManager(vaultRoot);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  it("returns empty array when no skills are installed", async () => {
    const result = await listSkills(registryManager);
    expect(result.skills).toEqual([]);
  });

  it("returns all installed skills", async () => {
    await registryManager.add({
      name: "skill-a",
      source: "local",
      version: "1.0.0",
      installed_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      status: "active",
      auto_update: false,
    });
    await registryManager.add({
      name: "skill-b",
      source: "git",
      version: "2.0.0",
      installed_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
      status: "active",
      auto_update: true,
    });

    const result = await listSkills(registryManager);
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe("skill-a");
    expect(result.skills[1].name).toBe("skill-b");
  });

  it("returns skills with correct shape", async () => {
    await registryManager.add({
      name: "test-skill",
      source: "local",
      source_path: "/path/to/skill.md",
      version: "1.0.0",
      installed_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      status: "active",
      auto_update: false,
      depends_on: ["base-skill"],
    });

    const result = await listSkills(registryManager);
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.name).toBe("test-skill");
    expect(skill.source).toBe("local");
    expect(skill.source_path).toBe("/path/to/skill.md");
    expect(skill.version).toBe("1.0.0");
    expect(skill.status).toBe("active");
    expect(skill.auto_update).toBe(false);
    expect(skill.depends_on).toEqual(["base-skill"]);
  });

  it("returns empty array when registry file is missing", async () => {
    const altRoot = join(vaultRoot, "alt");
    await mkdir(altRoot, { recursive: true });
    const altManager = new SkillRegistryManager(altRoot);

    const result = await listSkills(altManager);
    expect(result.skills).toEqual([]);
  });

  it("filters out invalid entries in registry", async () => {
    const { writeFile: fsWriteFile, mkdir: fsMkdir } = await import("fs/promises");
    const skillsDir = join(vaultRoot, "skills");
    await fsMkdir(skillsDir, { recursive: true });

    await fsWriteFile(
      join(skillsDir, "registry.json"),
      JSON.stringify({
        skills: [
          {
            name: "valid-skill",
            source: "local",
            version: "1.0.0",
            installed_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
            status: "active",
            auto_update: false,
          },
          { name: "invalid", missing: "fields" },
          "not-an-object",
          null,
        ],
      }),
      "utf-8"
    );

    const result = await listSkills(registryManager);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe("valid-skill");
  });
});
