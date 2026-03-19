import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter, mergeFrontmatter, validateFrontmatter } from "./frontmatter.js";
import type { Frontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  const cases = [
    {
      name: "with frontmatter",
      input: "---\ntitle: Test\nstatus: active\n---\n\nContent here",
      expectedData: { title: "Test", status: "active" },
      expectedContent: "\nContent here",
    },
    {
      name: "without frontmatter",
      input: "# Just markdown\n\nNo frontmatter",
      expectedData: {},
      expectedContent: "# Just markdown\n\nNo frontmatter",
    },
    {
      name: "empty string",
      input: "",
      expectedData: {},
      expectedContent: "",
    },
    {
      name: "only frontmatter dashes",
      input: "---\n---\n",
      expectedData: {},
      expectedContent: "",
    },
    {
      name: "malformed YAML",
      input: "---\ninvalid: [unclosed\n---\nContent",
      expectedData: {},
      expectedContent: "---\ninvalid: [unclosed\n---\nContent",
    },
    {
      name: "with array field",
      input: "---\ntags:\n  - tag1\n  - tag2\n---\nContent",
      expectedData: { tags: ["tag1", "tag2"] },
      expectedContent: "Content",
    },
    {
      name: "with nested object",
      input: "---\nmeta:\n  key: value\n---\nContent",
      expectedData: { meta: { key: "value" } },
      expectedContent: "Content",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = parseFrontmatter(c.input);
      expect(result.data).toEqual(c.expectedData);
      expect(result.content).toBe(c.expectedContent);
    });
  }
});

describe("serializeFrontmatter", () => {
  it("serializes with content", () => {
    const data: Frontmatter = { type: "adr", status: "active" };
    const content = "# My ADR\n\nContent";
    const result = serializeFrontmatter(data, content);
    expect(result).toContain("---");
    expect(result).toContain("type: adr");
    expect(result).toContain("status: active");
    expect(result).toContain("# My ADR");
  });

  it("serializes with empty content", () => {
    const data: Frontmatter = { type: "task" };
    const result = serializeFrontmatter(data, "");
    expect(result).toContain("type: task");
  });

  it("serializes array fields", () => {
    const data: Frontmatter = { tags: ["a", "b"] };
    const result = serializeFrontmatter(data, "content");
    expect(result).toContain("tags:");
    expect(result).toContain("- a");
    expect(result).toContain("- b");
  });
});

describe("createFrontmatter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates frontmatter with defaults", () => {
    const result = createFrontmatter({});
    expect(result.type).toBe("index");
    expect(result.status).toBe("active");
    expect(result.created).toBe("2024-01-15");
    expect(result.updated).toBe("2024-01-15");
  });

  it("overrides defaults", () => {
    const result = createFrontmatter({ type: "adr", status: "draft" });
    expect(result.type).toBe("adr");
    expect(result.status).toBe("draft");
  });

  it("preserves custom fields", () => {
    const result = createFrontmatter({ custom: "value" } as Frontmatter);
    expect((result as any).custom).toBe("value");
  });

  it("uses provided created date", () => {
    const result = createFrontmatter({ created: "2023-12-01" });
    expect(result.created).toBe("2023-12-01");
    expect(result.updated).toBe("2024-01-15");
  });
});

describe("mergeFrontmatter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges new fields", () => {
    const existing: Frontmatter = { type: "adr", status: "draft" };
    const result = mergeFrontmatter(existing, { status: "active" });
    expect(result.type).toBe("adr");
    expect(result.status).toBe("active");
  });

  it("adds new fields", () => {
    const existing: Frontmatter = { type: "task" };
    const result = mergeFrontmatter(existing, { tags: ["urgent"] });
    expect(result.type).toBe("task");
    expect(result.tags).toEqual(["urgent"]);
  });

  it("updates the updated timestamp", () => {
    const existing: Frontmatter = { type: "adr", updated: "2023-01-01" };
    const result = mergeFrontmatter(existing, {});
    expect(result.updated).toBe("2024-01-15");
  });

  it("preserves existing fields not in updates", () => {
    const existing: Frontmatter = { type: "adr", project: "test", created: "2023-01-01" };
    const result = mergeFrontmatter(existing, { status: "done" });
    expect(result.type).toBe("adr");
    expect(result.project).toBe("test");
    expect(result.created).toBe("2023-01-01");
    expect(result.status).toBe("done");
  });
});

describe("validateFrontmatter", () => {
  it("returns empty array for valid frontmatter", () => {
    const data: Frontmatter = { type: "adr", status: "active" };
    expect(validateFrontmatter(data)).toEqual([]);
  });

  it("returns error for invalid type", () => {
    const data: Frontmatter = { type: "invalid" };
    const errors = validateFrontmatter(data);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Invalid type");
  });

  it("returns error for invalid status", () => {
    const data: Frontmatter = { status: "invalid" };
    const errors = validateFrontmatter(data);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Invalid status");
  });

  it("returns error when tags is not array", () => {
    const data: Frontmatter = { tags: "not-array" as any };
    const errors = validateFrontmatter(data);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Tags must be an array");
  });

  it("returns error when related is not array", () => {
    const data: Frontmatter = { related: "not-array" as any };
    const errors = validateFrontmatter(data);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Related must be an array");
  });

  it("returns multiple errors", () => {
    const data: Frontmatter = { type: "bad", status: "worse", tags: "nope" as any };
    const errors = validateFrontmatter(data);
    expect(errors.length).toBe(3);
  });

  it("accepts all valid types", () => {
    const validTypes = ["context", "adr", "brainstorm", "decision", "todo", "incident", "pattern", "evaluation", "index", "task", "learning", "session"];
    for (const type of validTypes) {
      const errors = validateFrontmatter({ type });
      expect(errors).toEqual([]);
    }
  });

  it("accepts all valid statuses", () => {
    const validStatuses = ["active", "resolved", "deprecated", "draft", "backlog", "in-progress", "blocked", "done", "cancelled", "completed"];
    for (const status of validStatuses) {
      const errors = validateFrontmatter({ status });
      expect(errors).toEqual([]);
    }
  });
});
