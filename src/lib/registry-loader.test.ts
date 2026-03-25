// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, writeFile, rm } from "fs/promises";
import {
  loadRegistry,
  getRegistry,
  getSkillSourceUrl,
  getDomainSummary,
  mergeLocalSkills,
  _clearRegistry,
  _setUserRegistryPath,
  _resetUserRegistryPath,
  _setBundledRegistryPath,
  _resetBundledRegistryPath,
} from "./registry-loader.js";
import type { RegistryData, RegistrySkill } from "./registry-loader.js";

const MINIMAL_REGISTRY: RegistryData = {
  registry_version: "0.3.0-test",
  generated_at: "2026-03-25T00:00:00Z",
  sources: {
    test: { repo: "test/repo", base_url: "https://raw.githubusercontent.com/test/repo/main" },
  },
  domains: [
    { id: "testing", name: "Testing", description: "Test domain", priority: "core", triggers: ["test", "spec"] },
  ],
  skills: [
    {
      id: "test/skill-one",
      name: "Skill One",
      source: "test",
      path: "skills/skill-one/SKILL.md",
      domains: ["testing"],
      description: "A test skill",
      triggers: ["skill one", "first"],
      version: "2026-03-25",
    },
  ],
  profiles: [
    { name: "default", description: "Default profile", resolutions: [] },
  ],
};

describe("registry-loader", () => {
  let testDir: string;

  beforeEach(async () => {
    _clearRegistry();
    testDir = join(tmpdir(), `registry-test-${process.pid}-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    _clearRegistry();
    _resetUserRegistryPath();
    _resetBundledRegistryPath();
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("loadRegistry", () => {
    it("loads the bundled registry", async () => {
      // Point user path to nonexistent file to force bundled fallback
      _setUserRegistryPath(join(testDir, "nonexistent.json"));

      const registry = await loadRegistry();
      expect(registry.registry_version).toBe("0.3.0");
      expect(registry.skills.length).toBeGreaterThanOrEqual(87);
      expect(registry.domains.length).toBe(28);
    });

    it("prefers user registry over bundled", async () => {
      const userFile = join(testDir, "user-registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);

      const registry = await loadRegistry();
      expect(registry.registry_version).toBe("0.3.0-test");
      expect(registry.skills).toHaveLength(1);
    });

    it("falls back to bundled when user registry is invalid", async () => {
      const userFile = join(testDir, "bad-registry.json");
      await writeFile(userFile, JSON.stringify({ invalid: true }), "utf-8");
      _setUserRegistryPath(userFile);

      const registry = await loadRegistry();
      expect(registry.registry_version).toBe("0.3.0");
      expect(registry.skills.length).toBeGreaterThanOrEqual(87);
    });

    it("falls back to bundled when user registry is corrupt JSON", async () => {
      const userFile = join(testDir, "corrupt.json");
      await writeFile(userFile, "NOT VALID JSON {{{", "utf-8");
      _setUserRegistryPath(userFile);

      const registry = await loadRegistry();
      expect(registry.registry_version).toBe("0.3.0");
    });

    it("caches the registry in memory", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const first = await loadRegistry();
      const second = await loadRegistry();
      expect(first).toBe(second); // Same reference
    });

    it("throws when no valid registry is available", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      _setBundledRegistryPath(join(testDir, "also-nonexistent.json"));

      await expect(loadRegistry()).rejects.toThrow("no valid registry found");
    });
  });

  describe("getRegistry", () => {
    it("throws if registry not yet loaded", () => {
      expect(() => getRegistry()).toThrow("not loaded");
    });

    it("returns loaded registry", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      await loadRegistry();
      const registry = getRegistry();
      expect(registry.skills.length).toBeGreaterThanOrEqual(87);
    });
  });

  describe("getSkillSourceUrl", () => {
    it("constructs full URL from source and path", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      const url = getSkillSourceUrl(registry.skills[0], registry);
      expect(url).toBe("https://raw.githubusercontent.com/test/repo/main/skills/skill-one/SKILL.md");
    });

    it("throws for unknown source", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      const fakeSkill = { ...registry.skills[0], source: "nonexistent" } as RegistrySkill;
      expect(() => getSkillSourceUrl(fakeSkill, registry)).toThrow("Unknown source");
    });
  });

  describe("getDomainSummary", () => {
    it("returns comma-separated domain names", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      const summary = getDomainSummary(registry);
      expect(summary).toBe("Testing");
    });

    it("lists all 28 domains from bundled registry", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();

      const summary = getDomainSummary(registry);
      expect(summary).toContain("Test-Driven Development");
      expect(summary).toContain("Frontend Design");
      expect(summary).toContain("Go");
      expect(summary).toContain("Security");
    });
  });

  describe("registry data integrity", () => {
    it("every skill references a valid source", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      for (const skill of registry.skills) {
        expect(registry.sources[skill.source]).toBeDefined();
      }
    });

    it("every skill references valid domains", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      const domainIds = new Set(registry.domains.map((d) => d.id));
      for (const skill of registry.skills) {
        for (const domain of skill.domains) {
          expect(domainIds.has(domain)).toBe(true);
        }
      }
    });

    it("every skill has at least one trigger", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      for (const skill of registry.skills) {
        expect(skill.triggers.length).toBeGreaterThan(0);
      }
    });

    it("every domain has at least one trigger", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      for (const domain of registry.domains) {
        expect(domain.triggers.length).toBeGreaterThan(0);
      }
    });

    it("every profile resolution references valid skill and domain", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      const skillIds = new Set(registry.skills.map((s) => s.id));
      const domainIds = new Set(registry.domains.map((d) => d.id));
      for (const profile of registry.profiles) {
        for (const res of profile.resolutions) {
          expect(domainIds.has(res.domain_id)).toBe(true);
          expect(skillIds.has(res.chosen_skill_id)).toBe(true);
        }
      }
    });

    it("no duplicate skill IDs", async () => {
      _setUserRegistryPath(join(testDir, "nonexistent.json"));
      const registry = await loadRegistry();
      const ids = registry.skills.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("mergeLocalSkills", () => {
    it("adds local skills to registry", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      const localSkills = [{
        id: "local/my-skill",
        name: "My Skill",
        source: "local",
        path: "/tmp/SKILL.md",
        domains: [] as string[],
        description: "A local skill",
        triggers: ["my", "skill"],
        version: "local",
      }];

      const merged = mergeLocalSkills(registry, localSkills);
      expect(merged.skills.length).toBe(registry.skills.length + 1);
      expect(merged.skills.find((s) => s.id === "local/my-skill")).toBeDefined();
      expect(merged.sources.local).toBeDefined();
    });

    it("does not duplicate existing skills", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      // Try to add a skill with the same ID as existing
      const localSkills = [{
        id: MINIMAL_REGISTRY.skills[0].id,
        name: "Duplicate",
        source: "local",
        path: "/tmp/SKILL.md",
        domains: [] as string[],
        description: "Duplicate",
        triggers: ["dup"],
        version: "local",
      }];

      const merged = mergeLocalSkills(registry, localSkills);
      expect(merged.skills.length).toBe(registry.skills.length);
    });

    it("preserves original registry data", async () => {
      const userFile = join(testDir, "registry.json");
      await writeFile(userFile, JSON.stringify(MINIMAL_REGISTRY), "utf-8");
      _setUserRegistryPath(userFile);
      const registry = await loadRegistry();

      const merged = mergeLocalSkills(registry, []);
      expect(merged.domains).toEqual(registry.domains);
      expect(merged.profiles).toEqual(registry.profiles);
      expect(merged.registry_version).toBe(registry.registry_version);
    });
  });
});
