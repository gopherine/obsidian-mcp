// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scoreTriggers, scoreDomains, scoreSkills, matchTask } from "./trigger-matcher.js";
import { loadRegistry, _clearRegistry } from "./registry-loader.js";
import type { RegistryData } from "./registry-loader.js";

let registry: RegistryData;

beforeAll(async () => {
  registry = await loadRegistry();
});

afterAll(() => {
  _clearRegistry();
});

describe("trigger-matcher", () => {
  describe("scoreTriggers", () => {
    it("scores exact single-word match at 1.0", () => {
      expect(scoreTriggers(["test", "code"], ["test"])).toBe(1.0);
    });

    it("scores full phrase match at 2.0", () => {
      expect(scoreTriggers(["red", "green", "refactor"], ["red green refactor"])).toBe(2.0);
    });

    it("scores partial phrase match proportionally", () => {
      // "red green refactor" — 2 of 3 words match
      const score = scoreTriggers(["red", "green"], ["red green refactor"]);
      expect(score).toBeCloseTo(0.5 * (2 / 3), 2);
    });

    it("returns 0 for no matches", () => {
      expect(scoreTriggers(["typescript", "react"], ["python", "django"])).toBe(0);
    });

    it("returns 0 for empty inputs", () => {
      expect(scoreTriggers([], ["test"])).toBe(0);
      expect(scoreTriggers(["test"], [])).toBe(0);
    });

    it("sums scores across multiple triggers", () => {
      // Two single-word matches
      const score = scoreTriggers(["test", "coverage"], ["test", "coverage", "mock"]);
      expect(score).toBe(2.0); // 1.0 + 1.0
    });
  });

  describe("scoreDomains", () => {
    it("matches tdd domain for testing-related tasks", () => {
      const matches = scoreDomains("write unit tests with coverage", registry);
      const tdd = matches.find((m) => m.domain.id === "tdd");
      expect(tdd).toBeDefined();
      expect(tdd!.score).toBeGreaterThanOrEqual(0.5);
    });

    it("matches frontend-design for UI/UX tasks", () => {
      const matches = scoreDomains("design a responsive UI layout with tailwind", registry);
      const fd = matches.find((m) => m.domain.id === "frontend-design");
      expect(fd).toBeDefined();
      expect(fd!.score).toBeGreaterThanOrEqual(0.5);
    });

    it("matches frontend-design for UX design task (the original bug)", () => {
      const matches = scoreDomains("UX design analysis of a terminal TUI application", registry);
      const fd = matches.find((m) => m.domain.id === "frontend-design");
      expect(fd).toBeDefined();
    });

    it("matches security domain for vulnerability tasks", () => {
      const matches = scoreDomains("review code for security vulnerabilities and OWASP issues", registry);
      const sec = matches.find((m) => m.domain.id === "security");
      expect(sec).toBeDefined();
    });

    it("matches go domain for Go-specific tasks", () => {
      const matches = scoreDomains("write golang tests with goroutines", registry);
      const go = matches.find((m) => m.domain.id === "go");
      expect(go).toBeDefined();
    });

    it("matches database domain for SQL tasks", () => {
      const matches = scoreDomains("optimize postgres query and add database index", registry);
      const db = matches.find((m) => m.domain.id === "database");
      expect(db).toBeDefined();
    });

    it("returns empty for unrelated tasks", () => {
      const matches = scoreDomains("do it", registry);
      expect(matches).toEqual([]);
    });

    it("returns sorted by score descending", () => {
      const matches = scoreDomains("write tests and review code", registry);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
      }
    });
  });

  describe("scoreSkills", () => {
    it("ranks skills within a domain by trigger relevance", () => {
      const skills = scoreSkills("write table driven go tests with benchmarks", "tdd", registry);
      expect(skills.length).toBeGreaterThan(0);
      // Go Testing should rank high since it has "go test", "table driven", "benchmark"
      const goTesting = skills.find((s) => s.skill.id === "ecc/golang-testing");
      expect(goTesting).toBeDefined();
    });

    it("returns empty for non-existent domain", () => {
      const skills = scoreSkills("test something", "nonexistent-domain", registry);
      expect(skills).toEqual([]);
    });
  });

  describe("matchTask", () => {
    it("returns domain IDs for matching tasks", () => {
      const domains = matchTask("write unit tests for coverage", registry);
      expect(domains).toContain("tdd");
    });

    it("returns empty array for unmatched tasks", () => {
      const domains = matchTask("do it", registry);
      expect(domains).toEqual([]);
    });

    it("returns multiple domains when task spans areas", () => {
      const domains = matchTask("deploy docker containers with security review", registry);
      expect(domains.length).toBeGreaterThan(1);
    });
  });

  describe("regression: TASK_DOMAIN_MAP parity", () => {
    // These test cases verify that the trigger-based matcher produces the same
    // results as the old regex-based TASK_DOMAIN_MAP for common task descriptions.

    const cases: Array<[string, string]> = [
      ["brainstorm ideas for the new feature", "brainstorming"],
      ["write unit tests with TDD", "tdd"],
      ["review this pull request", "code-review"],
      ["plan the implementation", "planning"],
      ["debug this broken feature", "debugging"],
      ["check for security vulnerabilities", "security"],
      ["deploy to production", "shipping"],
      ["verify the build passes", "verification"],
      ["design a frontend component with CSS", "frontend-design"],
      ["orchestrate multiple agents", "agent-orchestration"],
      ["write a postgres query for the schema", "database"],
      ["write golang tests", "go"],
      ["python pytest fixtures", "python"],
      ["django rest framework API", "django"],
      ["spring boot java application", "spring-boot"],
      ["swift iOS swiftui view", "swift"],
      ["docker compose container", "docker"],
      ["rest api endpoint design", "api-design"],
      ["react nextjs state management hooks", "frontend-patterns"],
      ["express nodejs middleware backend", "backend-patterns"],
    ];

    for (const [task, expectedDomain] of cases) {
      it(`"${task}" → ${expectedDomain}`, () => {
        const domains = matchTask(task, registry);
        expect(domains).toContain(expectedDomain);
      });
    }
  });
});
