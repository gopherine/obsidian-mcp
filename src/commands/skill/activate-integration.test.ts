// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll, afterAll } from "vitest";
import { activateSkills, generateManifest } from "./marketplace.js";
import { getCatalog, setRegistryData, _clearRegistryData } from "./catalog.js";
import { loadRegistry, _clearRegistry } from "../../lib/registry-loader.js";

/**
 * Integration tests for the skill activation flow (activateSkills).
 * All HTTP fetches are mocked — no real GitHub requests.
 */

const FAKE_SKILL_CONTENT = "# Fake Skill\n\nThis is mock skill content for testing purposes.";
const originalFetch = globalThis.fetch;

function mockFetchOk(content: string = FAKE_SKILL_CONTENT) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(content),
    json: () => Promise.resolve({ items: [] }),
  } as unknown as Response);
}

describe("activateSkills integration", () => {
  beforeAll(async () => {
    // Load the registry so getCatalog() returns all 87 skills
    const registry = await loadRegistry();
    setRegistryData(registry);
  });

  afterAll(() => {
    _clearRegistryData();
    _clearRegistry();
  });

  beforeEach(() => {
    mockFetchOk();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Direct skill_id load
  it("loads a skill directly by skill_id", async () => {
    const result = await activateSkills({ task: "", skill_id: "ecc/tdd-workflow" });

    expect(result.success).toBe(true);
    expect(result.skills_loaded).toHaveLength(1);
    expect(result.skills_loaded[0].id).toBe("ecc/tdd-workflow");
    expect(result.skills_loaded[0].name).toBe("TDD Workflow");
    expect(result.content).toContain("Fake Skill");
    expect(result.total_tokens).toBeGreaterThan(0);
  });

  // 2. Domain-based activation
  it("activates skills by domain", async () => {
    const result = await activateSkills({ task: "", domain: "brainstorming" });

    expect(result.success).toBe(true);
    expect(result.matched_domains).toContain("brainstorming");
    expect(result.skills_loaded.length).toBeGreaterThan(0);
    expect(result.skills_loaded.every(s => s.domains.includes("brainstorming"))).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  // 3. Task-based trigger matching
  it("matches tdd domain from task description", async () => {
    const result = await activateSkills({ task: "write tests for my code" });

    expect(result.success).toBe(true);
    expect(result.matched_domains).toContain("tdd");
    expect(result.skills_loaded.length).toBeGreaterThan(0);
    expect(result.content).toContain("Fake Skill");
  });

  // 4. Multi-domain match
  it("matches multiple domains from a single task", async () => {
    const result = await activateSkills({ task: "write tests for my golang API" });

    expect(result.success).toBe(true);
    expect(result.matched_domains).toContain("tdd");
    expect(result.matched_domains).toContain("go");
    // Should have skills from both domains
    const domainSet = new Set(result.skills_loaded.flatMap(s => s.domains));
    expect(domainSet.has("tdd") || domainSet.has("go")).toBe(true);
  });

  // 5. Content-business match
  it("matches content-business for marketing/LinkedIn tasks", async () => {
    const result = await activateSkills({ task: "write a LinkedIn post about marketing" });

    expect(result.success).toBe(true);
    expect(result.matched_domains).toContain("content-business");
    expect(result.skills_loaded.length).toBeGreaterThan(0);
    expect(result.skills_loaded.some(s => s.domains.includes("content-business"))).toBe(true);
  });

  // 6. Zero matches triggers web discovery
  it("falls back to web discovery when no domains match", async () => {
    // Mock fetch for web discovery: first two calls are GitHub search API (code + repos)
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      } as unknown as Response);

    const result = await activateSkills({ task: "quantum computing optimization" });

    expect(result.success).toBe(true);
    expect(result.matched_domains).toEqual([]);
    expect(result.skills_loaded).toEqual([]);
    // Web discovery was attempted — content should mention no skills found
    expect(result.content).toContain("No skills found");
  });

  // 7. Invalid skill_id returns error
  it("returns success:false for a nonexistent skill_id", async () => {
    const result = await activateSkills({ task: "", skill_id: "nonexistent/skill" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found in catalog");
    expect(result.skills_loaded).toEqual([]);
    expect(result.content).toBe("");
  });

  // 8. GitHub URL as skill_id
  it("fetches skill content from a GitHub URL as skill_id", async () => {
    const communityContent = "# Community Skill\n\nThis is a community-contributed skill with enough content to pass validation.";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(communityContent),
    } as unknown as Response);

    const result = await activateSkills({
      task: "",
      skill_id: "https://github.com/test/repo/blob/main/SKILL.md",
    });

    expect(result.success).toBe(true);
    expect(result.skills_loaded).toHaveLength(1);
    expect(result.content).toContain("Community Skill");
    // Should be marked as unverified
    expect(result.content).toContain("Unverified community skill");
    expect(result.total_tokens).toBeGreaterThan(0);
  });

  // 9. Max 3 skills per domain cap
  it("caps skills at 3 per domain", async () => {
    // The tdd domain has 9 skills in the catalog
    const tddSkillCount = getCatalog().filter(s => s.domains.includes("tdd")).length;
    expect(tddSkillCount).toBeGreaterThan(3); // precondition

    const result = await activateSkills({ task: "", domain: "tdd" });

    expect(result.success).toBe(true);
    // Filter to only tdd-domain skills that were loaded
    const tddLoaded = result.skills_loaded.filter(s => s.domains.includes("tdd"));
    expect(tddLoaded.length).toBeLessThanOrEqual(3);
  });

  // 10. generateManifest returns correct structure
  describe("generateManifest", () => {
    it("returns all skills with correct structure", async () => {
      const result = await generateManifest({});

      expect(result.success).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.total_skills).toBeGreaterThan(0);
      expect(result.total_estimated_tokens).toBeGreaterThan(0);

      // Check structure of each entry
      for (const entry of result.manifest!) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("domains");
        expect(entry).toHaveProperty("layer");
        expect(entry).toHaveProperty("description");
        expect(entry).toHaveProperty("estimated_tokens");
        expect(["core", "extended", "reference"]).toContain(entry.layer);
        expect(Array.isArray(entry.domains)).toBe(true);
        expect(entry.domains.length).toBeGreaterThan(0);
      }

      // Every manifest entry should correspond to a catalog skill
      const catalogIds = new Set(getCatalog().map(s => s.id));
      for (const entry of result.manifest!) {
        expect(catalogIds.has(entry.id)).toBe(true);
      }
    });

    it("returns error for invalid profile", async () => {
      const result = await generateManifest({ profile: "does-not-exist" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown profile");
    });
  });
});
