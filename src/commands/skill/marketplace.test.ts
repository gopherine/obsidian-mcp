// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { describe, it, expect } from "vitest";
import { matchTaskToDomains, getSkillAwarenessBlock } from "./marketplace.js";

describe("matchTaskToDomains", () => {
  // Previously invisible domains — the core bug
  it("matches content-business for market research", () => {
    expect(matchTaskToDomains("help me do market research")).toContain("content-business");
  });

  it("matches content-business for LinkedIn posts", () => {
    expect(matchTaskToDomains("write a LinkedIn post")).toContain("content-business");
  });

  it("matches content-business for investor outreach", () => {
    expect(matchTaskToDomains("draft investor pitch deck")).toContain("content-business");
  });

  it("matches content-business for article writing", () => {
    expect(matchTaskToDomains("write a blog post about our launch")).toContain("content-business");
  });

  it("matches go domain for Go tasks", () => {
    expect(matchTaskToDomains("write tests for my golang API")).toContain("go");
  });

  it("matches python domain for Python tasks", () => {
    expect(matchTaskToDomains("refactor this Python module")).toContain("python");
  });

  it("matches django domain", () => {
    expect(matchTaskToDomains("build a Django REST API")).toContain("django");
  });

  it("matches swift domain", () => {
    expect(matchTaskToDomains("add SwiftUI navigation")).toContain("swift");
  });

  it("matches docker domain", () => {
    expect(matchTaskToDomains("write a Dockerfile for this app")).toContain("docker");
  });

  it("matches spring-boot domain", () => {
    expect(matchTaskToDomains("create a Spring Boot service")).toContain("spring-boot");
  });

  it("matches 3d-animation domain", () => {
    expect(matchTaskToDomains("build a Three.js scene")).toContain("3d-animation");
  });

  it("matches api-design domain", () => {
    expect(matchTaskToDomains("design the REST API endpoints")).toContain("api-design");
  });

  it("matches git-workflow domain", () => {
    expect(matchTaskToDomains("create a branch and merge strategy")).toContain("git-workflow");
  });

  // Original domains still work
  it("matches brainstorming", () => {
    expect(matchTaskToDomains("let's brainstorm this feature")).toContain("brainstorming");
  });

  it("matches tdd", () => {
    expect(matchTaskToDomains("write tests for this module")).toContain("tdd");
  });

  it("matches debugging", () => {
    expect(matchTaskToDomains("debug why this endpoint is broken")).toContain("debugging");
  });

  it("matches security", () => {
    expect(matchTaskToDomains("review this for security vulnerabilities")).toContain("security");
  });

  it("matches database", () => {
    expect(matchTaskToDomains("optimize this postgres query")).toContain("database");
  });

  // Multi-domain matching
  it("matches multiple domains from one task", () => {
    const result = matchTaskToDomains("write tests for my golang API");
    expect(result).toContain("tdd");
    expect(result).toContain("go");
  });

  // No match returns empty
  it("returns empty for unrelated tasks", () => {
    expect(matchTaskToDomains("hello world")).toEqual([]);
  });

  // False positive guards — broad patterns must not over-trigger
  it("does not match go domain for 'let's go ahead and deploy'", () => {
    expect(matchTaskToDomains("let's go ahead and deploy")).not.toContain("go");
  });

  it("does not match go domain for 'go review this PR'", () => {
    expect(matchTaskToDomains("go review this PR")).not.toContain("go");
  });

  it("does not match agent-engineering for 'evaluate this design'", () => {
    expect(matchTaskToDomains("evaluate this design")).not.toContain("agent-engineering");
  });

  it("does not match database for 'query the API parameters'", () => {
    expect(matchTaskToDomains("query the API parameters")).not.toContain("database");
  });

  it("does not match shipping for 'membership relationship'", () => {
    expect(matchTaskToDomains("check the membership relationship")).not.toContain("shipping");
  });
});

describe("getSkillAwarenessBlock", () => {
  it("does not hardcode domain list", () => {
    const block = getSkillAwarenessBlock();
    // Should use verb-led triggers, not domain taxonomy
    expect(block).toContain("Write, review, test, or debug");
    expect(block).toContain("skill package manager");
    // Should NOT list individual domains
    expect(block).not.toContain("- **brainstorming** —");
    expect(block).not.toContain("- **tdd** —");
  });

  it("includes dynamic skill count", () => {
    const block = getSkillAwarenessBlock();
    // Should include actual count from CATALOG, not hardcoded number
    expect(block).toMatch(/\d+\+ skills across \d+ repos/);
  });
});
