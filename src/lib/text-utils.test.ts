// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { extractKeywords, buildSearchQuery, normalizeCacheKey } from "./text-utils.js";

describe("text-utils", () => {
  describe("extractKeywords", () => {
    it("strips stopwords and short tokens", () => {
      const kw = extractKeywords("I want to find a good testing framework");
      expect(kw).toContain("testing");
      expect(kw).toContain("framework");
      expect(kw).not.toContain("want");
      expect(kw).not.toContain("to");
      expect(kw).not.toContain("a");
    });

    it("lowercases all keywords", () => {
      const kw = extractKeywords("Django REST Framework Patterns");
      expect(kw).toEqual(expect.arrayContaining(["django", "rest", "framework", "patterns"]));
    });

    it("removes non-alphanumeric characters", () => {
      const kw = extractKeywords("What's the best C++ testing tool?");
      expect(kw).not.toContain("what's");
      expect(kw).toContain("best");
      expect(kw).toContain("testing");
      expect(kw).toContain("tool");
    });

    it("returns empty for all-stopword input", () => {
      const kw = extractKeywords("do it");
      expect(kw).toEqual([]);
    });

    it("preserves hyphenated words", () => {
      const kw = extractKeywords("test-driven development");
      expect(kw).toContain("test-driven");
      expect(kw).toContain("development");
    });
  });

  describe("buildSearchQuery", () => {
    it("joins keywords and appends filename:SKILL", () => {
      expect(buildSearchQuery(["django", "testing"])).toBe("django testing filename:SKILL");
    });
  });

  describe("normalizeCacheKey", () => {
    it("produces stable sorted key", () => {
      const a = normalizeCacheKey("testing django framework");
      const b = normalizeCacheKey("django framework testing");
      expect(a).toBe(b);
    });

    it("ignores stopwords and casing", () => {
      const a = normalizeCacheKey("I want Django Testing");
      const b = normalizeCacheKey("django testing");
      expect(a).toBe(b);
    });
  });
});
