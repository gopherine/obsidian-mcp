// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchGitHubForSkills, fetchDiscoveredSkill, formatDiscoveryResults } from "./web-discovery.js";
import type { DiscoveredSkill } from "./web-discovery.js";

describe("web-discovery", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("searchGitHubForSkills", () => {
    it("extracts keywords and returns results from GitHub", async () => {
      const mockCodeResponse = {
        items: [
          {
            name: "SKILL.md",
            path: "skills/vp-cpo-readiness-advisor/SKILL.md",
            html_url: "https://github.com/deanpeters/Product-Manager-Skills/blob/main/skills/vp-cpo-readiness-advisor/SKILL.md",
            repository: {
              full_name: "deanpeters/Product-Manager-Skills",
              description: "Product Management skills for AI agents",
              stargazers_count: 42,
              updated_at: "2026-03-20T00:00:00Z",
            },
          },
        ],
      };

      const mockRepoResponse = { items: [] };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCodeResponse) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockRepoResponse) } as Response);

      const result = await searchGitHubForSkills("CPO product management skills");
      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].repo).toBe("deanpeters/Product-Manager-Skills");
      expect(result.results[0].name).toBe("Vp Cpo Readiness Advisor");
    });

    it("returns empty for very generic tasks", async () => {
      const result = await searchGitHubForSkills("do it");
      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
    });

    it("handles GitHub rate limiting gracefully", async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" } as Response)
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" } as Response);

      const result = await searchGitHubForSkills("CPO product management");
      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
    });

    it("deduplicates results across code and repo search", async () => {
      const item = {
        name: "SKILL.md",
        path: "SKILL.md",
        html_url: "https://github.com/test/repo/blob/main/SKILL.md",
        repository: {
          full_name: "test/repo",
          description: "Test",
          stargazers_count: 10,
          updated_at: "2026-03-20T00:00:00Z",
        },
      };

      const repoItem = {
        full_name: "test/repo",
        description: "Test",
        stargazers_count: 10,
        updated_at: "2026-03-20T00:00:00Z",
        html_url: "https://github.com/test/repo",
      };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [item] }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [repoItem] }) } as Response);

      const result = await searchGitHubForSkills("test skill management");
      expect(result.success).toBe(true);
      // Same repo should appear only once
      const repos = result.results.map(r => r.repo);
      expect(new Set(repos).size).toBe(repos.length);
    });

    it("caps results at 5", async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        name: "SKILL.md",
        path: `skills/skill-${i}/SKILL.md`,
        html_url: `https://github.com/test/repo-${i}/blob/main/SKILL.md`,
        repository: {
          full_name: `test/repo-${i}`,
          description: `Skill ${i}`,
          stargazers_count: 10 - i,
          updated_at: "2026-03-20T00:00:00Z",
        },
      }));

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);

      const result = await searchGitHubForSkills("product management skills framework");
      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("fetchDiscoveredSkill", () => {
    it("fetches and returns content from a GitHub URL", async () => {
      const skillContent = "# My Skill\n\nThis is a skill with enough content to be valid and useful for AI coding agents.";
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(skillContent),
      } as Response);

      const result = await fetchDiscoveredSkill("https://github.com/test/repo/blob/main/SKILL.md");
      expect(result.success).toBe(true);
      expect(result.content).toBe(skillContent);
    });

    it("rejects files that are too short", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("hi"),
      } as Response);

      const result = await fetchDiscoveredSkill("https://github.com/test/repo/blob/main/SKILL.md");
      expect(result.success).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("handles HTTP errors gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result = await fetchDiscoveredSkill("https://github.com/test/repo/blob/main/SKILL.md");
      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });
  });

  describe("formatDiscoveryResults", () => {
    it("formats results with trust signals", () => {
      const results: DiscoveredSkill[] = [
        {
          name: "VP CPO Readiness Advisor",
          description: "Coaches through VP/CPO transition",
          source_url: "https://github.com/deanpeters/Product-Manager-Skills/blob/main/skills/vp-cpo-readiness-advisor/SKILL.md",
          repo: "deanpeters/Product-Manager-Skills",
          stars: 42,
          updated_at: new Date().toISOString(),
          path: "skills/vp-cpo-readiness-advisor/SKILL.md",
        },
      ];

      const output = formatDiscoveryResults("CPO skills", results);
      expect(output).toContain("VP CPO Readiness Advisor");
      expect(output).toContain("deanpeters/Product-Manager-Skills");
      expect(output).toContain("42 stars");
      expect(output).toContain("Unverified community skill");
      expect(output).toContain("Present these options to the user");
    });

    it("returns graceful message when no results", () => {
      const output = formatDiscoveryResults("quantum computing skills", []);
      expect(output).toContain("No skills found");
      expect(output).toContain("Proceeding without methodology");
    });
  });
});
