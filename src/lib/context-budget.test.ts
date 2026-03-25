// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSkillBudget, fitSkillsToBudget } from "./context-budget.js";

// Mock tool-detector so we can control contextWindow / model
vi.mock("./tool-detector.js", () => ({
  detectTool: vi.fn(() => ({ tool: "unknown", contextWindow: 128_000 })),
}));

import { detectTool } from "./tool-detector.js";
const mockedDetectTool = vi.mocked(detectTool);

describe("getSkillBudget", () => {
  beforeEach(() => {
    mockedDetectTool.mockReturnValue({ tool: "unknown", contextWindow: 128_000 });
  });

  it("returns 15% of default 128k context window (clamped)", () => {
    const result = getSkillBudget();
    // 128_000 * 0.15 = 19_200
    expect(result.totalBudget).toBe(19_200);
    expect(result.contextWindow).toBe(128_000);
  });

  it("clamps to MIN_BUDGET_TOKENS for tiny context windows", () => {
    mockedDetectTool.mockReturnValue({ tool: "unknown", contextWindow: 4_000 });
    const result = getSkillBudget();
    // 4_000 * 0.15 = 600 → clamped to 2_000
    expect(result.totalBudget).toBe(2_000);
  });

  it("clamps to MAX_BUDGET_TOKENS for very large context windows", () => {
    mockedDetectTool.mockReturnValue({ tool: "claude-code", model: "claude-opus-4-6", contextWindow: 1_000_000 });
    const result = getSkillBudget();
    // 1_000_000 * 0.15 = 150_000 → clamped to 50_000
    expect(result.totalBudget).toBe(50_000);
    expect(result.model).toBe("claude-opus-4-6");
  });

  it("falls back to 128k when contextWindow is undefined", () => {
    mockedDetectTool.mockReturnValue({ tool: "unknown" });
    const result = getSkillBudget();
    expect(result.contextWindow).toBe(128_000);
    expect(result.totalBudget).toBe(19_200);
  });
});

describe("fitSkillsToBudget", () => {
  it("includes all skills when they fit", () => {
    const contents = ["short", "also short"];
    const result = fitSkillsToBudget(contents, 10_000);
    expect(result.included).toEqual([0, 1]);
    expect(result.excluded).toEqual([]);
    expect(result.usedTokens).toBeGreaterThan(0);
  });

  it("excludes skills that exceed budget", () => {
    // Each 'a'.repeat(1000) ≈ 288 tokens (1000/4*1.15)
    const big = "a".repeat(4000); // ~1150 tokens
    const contents = [big, big, big];
    const result = fitSkillsToBudget(contents, 2000);
    expect(result.included).toEqual([0]);
    expect(result.excluded).toEqual([1, 2]);
  });

  it("preserves priority order — earlier items preferred", () => {
    const small = "a".repeat(100); // ~29 tokens
    const big = "a".repeat(4000); // ~1150 tokens
    const contents = [small, big, small];
    const result = fitSkillsToBudget(contents, 1200);
    // small fits (29), big fits (29+1150=1179), second small would be 1208 > 1200
    expect(result.included).toEqual([0, 1]);
    expect(result.excluded).toEqual([2]);
  });

  it("returns empty included for zero budget", () => {
    const contents = ["hello"];
    const result = fitSkillsToBudget(contents, 0);
    expect(result.included).toEqual([]);
    expect(result.excluded).toEqual([0]);
    expect(result.usedTokens).toBe(0);
  });

  it("handles empty contents array", () => {
    const result = fitSkillsToBudget([], 10_000);
    expect(result.included).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(result.usedTokens).toBe(0);
  });

  it("excludes all remaining skills after first that does not fit", () => {
    const small = "a".repeat(100); // ~29 tokens
    const big = "a".repeat(40000); // ~11500 tokens
    const contents = [small, big, small];
    const result = fitSkillsToBudget(contents, 100);
    // big exceeds budget → big and all after it are excluded (priority order)
    expect(result.included).toEqual([0]);
    expect(result.excluded).toEqual([1, 2]);
  });
});
