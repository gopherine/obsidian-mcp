import { describe, it, expect } from "vitest";
import { escapeRegex } from "./escape-regex.js";

describe("escapeRegex", () => {
  const cases = [
    { name: "empty string", input: "", expected: "" },
    { name: "normal string", input: "hello", expected: "hello" },
    { name: "dot", input: "a.b", expected: "a\\.b" },
    { name: "asterisk", input: "a*b", expected: "a\\*b" },
    { name: "plus", input: "a+b", expected: "a\\+b" },
    { name: "question", input: "a?b", expected: "a\\?b" },
    { name: "caret", input: "a^b", expected: "a\\^b" },
    { name: "dollar", input: "a$b", expected: "a\\$b" },
    { name: "braces", input: "a{b}", expected: "a\\{b\\}" },
    { name: "parentheses", input: "a(b)", expected: "a\\(b\\)" },
    { name: "pipe", input: "a|b", expected: "a\\|b" },
    { name: "brackets", input: "a[b]", expected: "a\\[b\\]" },
    { name: "backslash", input: "a\\b", expected: "a\\\\b" },
    { name: "multiple special chars", input: "a.b*c+d?e^f$g{h}i(j)j|k[l]m\\n", expected: "a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)j\\|k\\[l\\]m\\\\n" },
    { name: "regex pattern", input: ".*+?^${}()|[]\\", expected: "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\" },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(escapeRegex(c.input)).toBe(c.expected);
    });
  }
});
