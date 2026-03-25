// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from "vitest";
import { SkillSession } from "./skill-session.js";

describe("SkillSession", () => {
  let session: SkillSession;

  beforeEach(() => {
    session = new SkillSession();
  });

  it("remembers and recalls a task", () => {
    session.remember("write unit tests for Go", ["tdd", "go"], ["ecc/golang-testing"]);
    const entry = session.recall("write unit tests for Go");
    expect(entry).not.toBeNull();
    expect(entry!.domains).toEqual(["tdd", "go"]);
    expect(entry!.skill_ids).toEqual(["ecc/golang-testing"]);
  });

  it("matches similar tasks via normalized key", () => {
    session.remember("Write Unit Tests for Go", ["tdd", "go"], ["ecc/golang-testing"]);
    // Same keywords in different order/case
    const entry = session.recall("unit tests Go write");
    expect(entry).not.toBeNull();
    expect(entry!.skill_ids).toEqual(["ecc/golang-testing"]);
  });

  it("returns null for unknown tasks", () => {
    expect(session.recall("deploy to production")).toBeNull();
  });

  it("has() returns correct boolean", () => {
    expect(session.has("write tests")).toBe(false);
    session.remember("write tests", ["tdd"], ["ecc/tdd-workflow"]);
    expect(session.has("write tests")).toBe(true);
  });

  it("clear() removes all entries", () => {
    session.remember("task one", ["tdd"], ["ecc/tdd-workflow"]);
    session.remember("task two", ["go"], ["ecc/golang-patterns"]);
    expect(session.size).toBe(2);
    session.clear();
    expect(session.size).toBe(0);
    expect(session.recall("task one")).toBeNull();
  });

  it("size tracks entry count", () => {
    expect(session.size).toBe(0);
    session.remember("task one", ["tdd"], ["a"]);
    expect(session.size).toBe(1);
    session.remember("task two", ["go"], ["b"]);
    expect(session.size).toBe(2);
  });

  it("handles empty task gracefully", () => {
    session.remember("", [], []);
    expect(session.has("")).toBe(false);
    expect(session.recall("")).toBeNull();
  });

  it("overwrites previous entry for same normalized task", () => {
    session.remember("write tests", ["tdd"], ["ecc/tdd-workflow"]);
    session.remember("write tests", ["tdd"], ["superpowers/test-driven-development"]);
    const entry = session.recall("write tests");
    expect(entry!.skill_ids).toEqual(["superpowers/test-driven-development"]);
    expect(session.size).toBe(1);
  });

  it("includes timestamp in entries", () => {
    const before = Date.now();
    session.remember("test task", ["tdd"], ["a"]);
    const after = Date.now();
    const entry = session.recall("test task");
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry!.timestamp).toBeLessThanOrEqual(after);
  });
});
