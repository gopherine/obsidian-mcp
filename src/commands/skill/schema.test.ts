import { describe, it, expect } from "vitest";
import {
  isSkillFrontmatter,
  validateSkillFrontmatter,
  SkillFrontmatter,
} from "./schema.js";

describe("isSkillFrontmatter", () => {
  it("returns true for valid minimal frontmatter", () => {
    expect(isSkillFrontmatter({ name: "test", description: "A test" })).toBe(true);
  });

  it("returns true for valid full frontmatter", () => {
    const fm: SkillFrontmatter = {
      name: "full",
      description: "Full skill",
      version: "1.0.0",
      author: "author",
      tags: ["a", "b"],
      depends_on: ["other"],
    };
    expect(isSkillFrontmatter(fm)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSkillFrontmatter(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isSkillFrontmatter("string")).toBe(false);
    expect(isSkillFrontmatter(42)).toBe(false);
    expect(isSkillFrontmatter(true)).toBe(false);
    expect(isSkillFrontmatter(undefined)).toBe(false);
  });

  it("returns false when name is missing", () => {
    expect(isSkillFrontmatter({ description: "test" })).toBe(false);
  });

  it("returns false when description is missing", () => {
    expect(isSkillFrontmatter({ name: "test" })).toBe(false);
  });

  it("returns false when name is not a string", () => {
    expect(isSkillFrontmatter({ name: 123, description: "test" })).toBe(false);
    expect(isSkillFrontmatter({ name: null, description: "test" })).toBe(false);
  });

  it("returns false when description is not a string", () => {
    expect(isSkillFrontmatter({ name: "test", description: 123 })).toBe(false);
  });

  it("returns false when version is not a string", () => {
    expect(isSkillFrontmatter({ name: "test", description: "test", version: 1 })).toBe(false);
  });

  it("returns false when author is not a string", () => {
    expect(isSkillFrontmatter({ name: "test", description: "test", author: {} })).toBe(false);
  });

  it("returns false when tags is not a string array", () => {
    expect(isSkillFrontmatter({ name: "test", description: "test", tags: "not-array" })).toBe(false);
    expect(isSkillFrontmatter({ name: "test", description: "test", tags: [1, 2] })).toBe(false);
  });

  it("returns false when depends_on is not a string array", () => {
    expect(isSkillFrontmatter({ name: "test", description: "test", depends_on: "string" })).toBe(false);
    expect(isSkillFrontmatter({ name: "test", description: "test", depends_on: [123] })).toBe(false);
  });

  it("returns true for empty optional arrays", () => {
    expect(isSkillFrontmatter({ name: "test", description: "test", tags: [], depends_on: [] })).toBe(true);
  });
});

describe("validateSkillFrontmatter", () => {
  it("returns valid for correct minimal frontmatter", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns valid for full frontmatter", () => {
    const result = validateSkillFrontmatter({
      name: "test",
      description: "desc",
      version: "1.0.0",
      author: "author",
      tags: ["a"],
      depends_on: ["base"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns error for null input", () => {
    const result = validateSkillFrontmatter(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Frontmatter must be an object");
  });

  it("returns error for non-object input", () => {
    const result = validateSkillFrontmatter("string");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Frontmatter must be an object");
  });

  it("returns error for missing name", () => {
    const result = validateSkillFrontmatter({ description: "desc" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("returns error for empty name", () => {
    const result = validateSkillFrontmatter({ name: "  ", description: "desc" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("returns error for missing description", () => {
    const result = validateSkillFrontmatter({ name: "test" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("returns error for empty description", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("returns error for non-string version", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc", version: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("returns error for non-string author", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc", author: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("author"))).toBe(true);
  });

  it("returns error for non-array tags", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc", tags: "bad" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tags"))).toBe(true);
  });

  it("returns error for non-string-array tags", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc", tags: [1, 2] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tags"))).toBe(true);
  });

  it("returns error for non-array depends_on", () => {
    const result = validateSkillFrontmatter({ name: "test", description: "desc", depends_on: "dep" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("depends_on"))).toBe(true);
  });

  it("returns multiple errors at once", () => {
    const result = validateSkillFrontmatter({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("allows empty object to collect all errors", () => {
    const result = validateSkillFrontmatter({ name: "", description: "", version: 1, author: 2, tags: "bad", depends_on: "bad" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(6);
  });
});
