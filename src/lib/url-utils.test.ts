// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { toRawUrl, inferSkillName, getRelativeAge } from "./url-utils.js";

describe("url-utils", () => {
  describe("toRawUrl", () => {
    it("converts github.com blob URL to raw URL", () => {
      expect(toRawUrl("https://github.com/user/repo/blob/main/SKILL.md"))
        .toBe("https://raw.githubusercontent.com/user/repo/main/SKILL.md");
    });

    it("handles nested paths", () => {
      expect(toRawUrl("https://github.com/user/repo/blob/main/skills/tdd/SKILL.md"))
        .toBe("https://raw.githubusercontent.com/user/repo/main/skills/tdd/SKILL.md");
    });
  });

  describe("inferSkillName", () => {
    it("extracts name from directory before SKILL.md", () => {
      expect(inferSkillName("skills/user-story/SKILL.md", "test/repo"))
        .toBe("User Story");
    });

    it("skips 'skills' directory and uses parent", () => {
      expect(inferSkillName("SKILL.md", "test/my-cool-skill"))
        .toBe("My Cool Skill");
    });

    it("skips .agents directory", () => {
      expect(inferSkillName(".agents/SKILL.md", "test/repo"))
        .toBe("Repo");
    });

    it("falls back to repo name", () => {
      expect(inferSkillName("SKILL.md", "owner/awesome-skills"))
        .toBe("Awesome Skills");
    });
  });

  describe("getRelativeAge", () => {
    it("returns 'today' for recent dates", () => {
      expect(getRelativeAge(new Date().toISOString())).toBe("today");
    });

    it("returns 'yesterday' for 1 day ago", () => {
      const yesterday = new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString();
      expect(getRelativeAge(yesterday)).toBe("yesterday");
    });

    it("returns days for < 30 days", () => {
      const twoWeeks = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      expect(getRelativeAge(twoWeeks)).toBe("14 days ago");
    });

    it("returns months for < 365 days", () => {
      const threeMonths = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      expect(getRelativeAge(threeMonths)).toBe("3 months ago");
    });

    it("returns years for >= 365 days", () => {
      const twoYears = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
      expect(getRelativeAge(twoYears)).toBe("2 years ago");
    });
  });
});
