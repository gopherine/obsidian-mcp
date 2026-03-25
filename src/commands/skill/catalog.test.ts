// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getDomains,
  getCatalog,
  getDomainPriority,
  detectCollisions,
  searchCatalog,
  getBuiltInProfiles,
  getProfile,
  setRegistryData,
  _clearRegistryData,
  hasRegistryData,
} from "./catalog.js";
import { loadRegistry, _clearRegistry } from "../../lib/registry-loader.js";

describe("catalog facade", () => {
  describe("without registry (fallback mode)", () => {
    it("getDomains returns fallback domains", () => {
      expect(getDomains().length).toBe(28);
      expect(getDomains().find((d) => d.id === "tdd")).toBeDefined();
    });

    it("getCatalog returns fallback catalog", () => {
      expect(getCatalog().length).toBe(8); // Only 8 prefetch skills
    });

    it("getDomainPriority returns correct priorities", () => {
      expect(getDomainPriority("tdd")).toBe("core");
      expect(getDomainPriority("go")).toBe("extended");
      expect(getDomainPriority("meta")).toBe("reference");
      expect(getDomainPriority("nonexistent")).toBeUndefined();
    });

    it("hasRegistryData returns false", () => {
      expect(hasRegistryData()).toBe(false);
    });

    it("detectCollisions works on fallback catalog", () => {
      const collisions = detectCollisions();
      // Fallback has limited skills, may have some collisions
      expect(Array.isArray(collisions)).toBe(true);
    });

    it("searchCatalog works on fallback catalog", () => {
      const results = searchCatalog({ text: "tdd" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toContain("tdd");
    });

    it("searchCatalog filters by domain", () => {
      const results = searchCatalog({ domain: "tdd" });
      expect(results.length).toBeGreaterThan(0);
      for (const skill of results) {
        expect(skill.domains).toContain("tdd");
      }
    });

    it("searchCatalog filters by repo", () => {
      const results = searchCatalog({ repo: "ecc" });
      expect(results.length).toBeGreaterThan(0);
      for (const skill of results) {
        expect(skill.repo).toBe("ecc");
      }
    });

    it("searchCatalog returns empty for no matches", () => {
      const results = searchCatalog({ text: "nonexistent-xyz-12345" });
      expect(results).toEqual([]);
    });

    it("getBuiltInProfiles returns fallback profiles", () => {
      const profiles = getBuiltInProfiles();
      expect(profiles.length).toBeGreaterThan(0);
      expect(profiles[0].name).toBe("ecc-first");
    });

    it("getProfile returns undefined for unknown profile", () => {
      expect(getProfile("nonexistent")).toBeUndefined();
    });
  });

  describe("with registry loaded", () => {
    beforeAll(async () => {
      const registry = await loadRegistry();
      setRegistryData(registry);
    });

    afterAll(() => {
      _clearRegistryData();
      _clearRegistry();
    });

    it("hasRegistryData returns true", () => {
      expect(hasRegistryData()).toBe(true);
    });

    it("getDomains returns full domain list", () => {
      expect(getDomains().length).toBe(28);
    });

    it("getCatalog returns full catalog from registry", () => {
      expect(getCatalog().length).toBe(87);
    });

    it("getCatalog skills have source URLs", () => {
      const tdd = getCatalog().find((s) => s.id === "ecc/tdd-workflow");
      expect(tdd).toBeDefined();
      expect(tdd!.source).toContain("https://raw.githubusercontent.com");
    });

    it("getCatalog skills have triggers", () => {
      const tdd = getCatalog().find((s) => s.id === "ecc/tdd-workflow");
      expect(tdd!.triggers).toBeDefined();
      expect(tdd!.triggers!.length).toBeGreaterThan(0);
    });

    it("getDomainPriority reads from registry", () => {
      expect(getDomainPriority("tdd")).toBe("core");
      expect(getDomainPriority("go")).toBe("extended");
    });

    it("detectCollisions finds multi-repo domains", () => {
      const collisions = detectCollisions();
      expect(collisions.length).toBeGreaterThan(0);
      // tdd has ECC, Superpowers, and gstack
      const tdd = collisions.find((c) => c.domain.id === "tdd");
      expect(tdd).toBeDefined();
    });

    it("searchCatalog searches full registry", () => {
      const results = searchCatalog({ text: "GSAP" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("getBuiltInProfiles returns all 3 profiles from registry", () => {
      const profiles = getBuiltInProfiles();
      expect(profiles.length).toBe(3);
      expect(profiles.map((p) => p.name)).toEqual(expect.arrayContaining(["ecc-first", "superpowers-first", "minimal"]));
    });

    it("getProfile returns correct profile", () => {
      const profile = getProfile("superpowers-first");
      expect(profile).toBeDefined();
      expect(profile!.resolutions.length).toBeGreaterThan(0);
    });
  });
});
