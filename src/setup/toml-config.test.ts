import { describe, it, expect } from "vitest";
import { insertTomlBlock, removeTomlBlock } from "./toml-config.js";

const BLOCK = `[mcp_servers.obsidian-mcp]
command = "npx"
args = ["-y", "@gopherine/obsidian-mcp"]

[mcp_servers.obsidian-mcp.env]
VAULT_PATH = "~/Vaults/ai"`;

describe("insertTomlBlock", () => {
  it("appends block with markers to empty content", () => {
    const result = insertTomlBlock("", BLOCK);
    expect(result).toContain("# obsidian-mcp:start");
    expect(result).toContain("# obsidian-mcp:end");
    expect(result).toContain('[mcp_servers.obsidian-mcp]');
  });

  it("appends block to existing content", () => {
    const existing = '[other]\nkey = "value"\n';
    const result = insertTomlBlock(existing, BLOCK);
    expect(result).toContain('[other]');
    expect(result).toContain("# obsidian-mcp:start");
  });

  it("returns null if block already exists (no force)", () => {
    const existing = "# obsidian-mcp:start\nold block\n# obsidian-mcp:end\n";
    expect(insertTomlBlock(existing, BLOCK, false)).toBeNull();
  });

  it("replaces existing block when force=true", () => {
    const existing = "# obsidian-mcp:start\nold block\n# obsidian-mcp:end\n";
    const result = insertTomlBlock(existing, BLOCK, true);
    expect(result).not.toBeNull();
    expect(result).not.toContain("old block");
    expect(result).toContain('[mcp_servers.obsidian-mcp]');
  });
});

describe("removeTomlBlock", () => {
  it("removes block between markers", () => {
    const content = `[other]\nkey = "value"\n\n# obsidian-mcp:start\n${BLOCK}\n# obsidian-mcp:end\n`;
    const result = removeTomlBlock(content);
    expect(result.content).not.toContain("obsidian-mcp");
    expect(result.content).toContain('[other]');
    expect(result.removed).toBe(true);
  });

  it("returns removed=false when no markers found", () => {
    const content = '[other]\nkey = "value"\n';
    const result = removeTomlBlock(content);
    expect(result.removed).toBe(false);
    expect(result.content).toBe(content);
  });
});
