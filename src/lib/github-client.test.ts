// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, afterEach } from "vitest";
import { searchGitHubCode, searchGitHubRepos } from "./github-client.js";

describe("github-client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("searchGitHubCode", () => {
    it("returns skills from GitHub code search", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              name: "SKILL.md",
              path: "skills/vp-advisor/SKILL.md",
              html_url: "https://github.com/test/repo/blob/main/skills/vp-advisor/SKILL.md",
              repository: {
                full_name: "test/repo",
                description: "Test repo",
                stargazers_count: 42,
                updated_at: "2026-03-20T00:00:00Z",
              },
            },
          ],
        }),
      } as Response);

      const results = await searchGitHubCode("product management filename:SKILL");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Vp Advisor");
      expect(results[0].repo).toBe("test/repo");
      expect(results[0].stars).toBe(42);
    });

    it("returns empty on 403 rate limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response);

      const results = await searchGitHubCode("test");
      expect(results).toEqual([]);
    });

    it("throws on non-403 errors", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      await expect(searchGitHubCode("test")).rejects.toThrow("500");
    });

    it("filters out non-skill files", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              name: "README.md",
              path: "README.md",
              html_url: "https://github.com/test/repo/blob/main/README.md",
              repository: { full_name: "test/repo", description: null, stargazers_count: 1, updated_at: "2026-03-20T00:00:00Z" },
            },
            {
              name: "SKILL.md",
              path: "SKILL.md",
              html_url: "https://github.com/test/repo2/blob/main/SKILL.md",
              repository: { full_name: "test/repo2", description: "Good", stargazers_count: 5, updated_at: "2026-03-20T00:00:00Z" },
            },
          ],
        }),
      } as Response);

      const results = await searchGitHubCode("test");
      expect(results).toHaveLength(1);
      expect(results[0].repo).toBe("test/repo2");
    });
  });

  describe("searchGitHubRepos", () => {
    it("returns skills from GitHub repo search", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              full_name: "test/cool-skills",
              description: "Cool skills for AI",
              stargazers_count: 100,
              updated_at: "2026-03-20T00:00:00Z",
              html_url: "https://github.com/test/cool-skills",
            },
          ],
        }),
      } as Response);

      const results = await searchGitHubRepos(["testing", "framework"]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("cool-skills");
      expect(results[0].source_url).toContain("/blob/main/SKILL.md");
    });

    it("returns empty on 403 rate limit", async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response);

      const results = await searchGitHubRepos(["test"]);
      expect(results).toEqual([]);
    });
  });
});
