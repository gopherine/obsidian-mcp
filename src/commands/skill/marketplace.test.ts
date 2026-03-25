// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { matchTaskToDomains, getSkillAwarenessBlock } from "./marketplace.js";

describe("matchTaskToDomains", () => {
  // Previously invisible domains — the core bug
  it("matches content-business for market research", async () => {
    expect(await matchTaskToDomains("help me do market research")).toContain("content-business");
  });

  it("matches content-business for LinkedIn posts", async () => {
    expect(await matchTaskToDomains("write a LinkedIn post")).toContain("content-business");
  });

  it("matches content-business for investor outreach", async () => {
    expect(await matchTaskToDomains("draft investor pitch deck")).toContain("content-business");
  });

  it("matches content-business for article writing", async () => {
    expect(await matchTaskToDomains("write a blog post about our launch")).toContain("content-business");
  });

  it("matches go domain for Go tasks", async () => {
    expect(await matchTaskToDomains("write tests for my golang API")).toContain("go");
  });

  it("matches python domain for Python tasks", async () => {
    expect(await matchTaskToDomains("refactor this Python module")).toContain("python");
  });

  it("matches django domain", async () => {
    expect(await matchTaskToDomains("build a Django REST API")).toContain("django");
  });

  it("matches swift domain", async () => {
    expect(await matchTaskToDomains("add SwiftUI navigation")).toContain("swift");
  });

  it("matches docker domain", async () => {
    expect(await matchTaskToDomains("write a Dockerfile for this app")).toContain("docker");
  });

  it("matches spring-boot domain", async () => {
    expect(await matchTaskToDomains("create a Spring Boot service")).toContain("spring-boot");
  });

  it("matches 3d-animation domain", async () => {
    expect(await matchTaskToDomains("build a Three.js scene")).toContain("3d-animation");
  });

  it("matches api-design domain", async () => {
    expect(await matchTaskToDomains("design the REST API endpoints")).toContain("api-design");
  });

  it("matches git-workflow domain", async () => {
    expect(await matchTaskToDomains("create a branch and merge strategy")).toContain("git-workflow");
  });

  // Original domains still work
  it("matches brainstorming", async () => {
    expect(await matchTaskToDomains("let's brainstorm this feature")).toContain("brainstorming");
  });

  it("matches tdd", async () => {
    expect(await matchTaskToDomains("write tests for this module")).toContain("tdd");
  });

  it("matches debugging", async () => {
    expect(await matchTaskToDomains("debug why this endpoint is broken")).toContain("debugging");
  });

  it("matches security", async () => {
    expect(await matchTaskToDomains("review this for security vulnerabilities")).toContain("security");
  });

  it("matches database", async () => {
    expect(await matchTaskToDomains("optimize this postgres query")).toContain("database");
  });

  // Multi-domain matching
  it("matches multiple domains from one task", async () => {
    const result = await matchTaskToDomains("write tests for my golang API");
    expect(result).toContain("tdd");
    expect(result).toContain("go");
  });

  // No match returns empty
  it("returns empty for unrelated tasks", async () => {
    expect(await matchTaskToDomains("hello world")).toEqual([]);
  });

  // False positive guards — broad patterns must not over-trigger
  it("does not match go domain for 'let's go ahead and deploy'", async () => {
    expect(await matchTaskToDomains("let's go ahead and deploy")).not.toContain("go");
  });

  it("does not match go domain for 'go review this PR'", async () => {
    expect(await matchTaskToDomains("go review this PR")).not.toContain("go");
  });

  it("does not match agent-engineering for 'evaluate this design'", async () => {
    expect(await matchTaskToDomains("evaluate this design")).not.toContain("agent-engineering");
  });

  it("does not match database for 'query the API parameters'", async () => {
    expect(await matchTaskToDomains("query the API parameters")).not.toContain("database");
  });

  it("does not match shipping for 'membership relationship'", async () => {
    expect(await matchTaskToDomains("check the membership relationship")).not.toContain("shipping");
  });
});

describe("getSkillAwarenessBlock", () => {
  it("uses runtime router branding", () => {
    const block = getSkillAwarenessBlock();
    expect(block).toContain("Write, review, test, or debug");
    expect(block).toContain("runtime skill router");
    // Should NOT list individual domains
    expect(block).not.toContain("- **brainstorming** —");
    expect(block).not.toContain("- **tdd** —");
  });

  it("includes dynamic skill count", () => {
    const block = getSkillAwarenessBlock();
    expect(block).toMatch(/\d+.*skills/);
  });
});
