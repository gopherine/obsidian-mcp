import { describe, it, expect } from "vitest";
import { estimateTokens, truncateToTokenBudget } from "./token-estimator.js";

describe("estimateTokens", () => {
  const cases = [
    { name: "empty string", input: "", expected: 0 },
    { name: "short text", input: "hello", expected: 2 },
    { name: "exactly 4 chars", input: "abcd", expected: 2 },
    { name: "exactly 8 chars", input: "abcdefgh", expected: 3 },
    { name: "long text", input: "a".repeat(100), expected: 29 },
    { name: "code with brackets", input: "function() { return []; }", expected: 8 },
    { name: "markdown with headers", input: "# Title\n\nParagraph", expected: 6 },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(estimateTokens(c.input)).toBe(c.expected);
    });
  }
});

describe("truncateToTokenBudget", () => {
  it("returns unchanged text when under budget", () => {
    const text = "Short text";
    const result = truncateToTokenBudget(text, 100);
    expect(result.text).toBe(text);
    expect(result.truncated).toBe(false);
  });

  it("truncates at section boundary when possible", () => {
    const text = "Intro content that is long enough to take up some tokens before we hit the section.\n\n## Section 1\nThis is the content for section one with enough text to matter.\n\n## Section 2\nContent for section two that will be truncated away.";
    const result = truncateToTokenBudget(text, 25);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("Intro content");
    expect(result.text).not.toContain("Section 2");
    expect(result.text).toContain("[truncated");
  });

  it("truncates at paragraph boundary when no section", () => {
    const text = "Para 1\n\nPara 2\n\nPara 3\n\nPara 4";
    const result = truncateToTokenBudget(text, 5);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[truncated");
  });

  it("truncates at newline when no paragraph boundary", () => {
    const text = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    const result = truncateToTokenBudget(text, 5);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[truncated");
  });

  it("includes truncation suffix", () => {
    const text = "a".repeat(1000);
    const result = truncateToTokenBudget(text, 10);
    expect(result.text).toContain("[truncated");
    expect(result.text).toContain("vault_project_context");
  });

  it("handles text shorter than budget", () => {
    const text = "Tiny";
    const result = truncateToTokenBudget(text, 1000);
    expect(result.text).toBe(text);
    expect(result.truncated).toBe(false);
  });

  it("handles markdown with frontmatter", () => {
    const text = "---\ntitle: Test\n---\n\n# Title\n\nContent here\n\n## Section\nMore content";
    const result = truncateToTokenBudget(text, 10);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[truncated");
  });
});
