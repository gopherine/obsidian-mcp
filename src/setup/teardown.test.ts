import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";
import { teardownClient } from "./teardown.js";
import { readJsonConfig, removeMcpEntry } from "./json-config.js";
import { removeMarkdownInstruction } from "./instructions.js";
import { CLIENT_REGISTRY } from "./clients.js";

vi.mock("./json-config.js");
vi.mock("./instructions.js");
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

const mockExists = vi.mocked(existsSync);

beforeEach(() => vi.resetAllMocks());

describe("teardownClient", () => {
  const claudeConfig = CLIENT_REGISTRY.find((c) => c.slug === "claude-code")!;

  it("removes JSON MCP entry and markdown instruction", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({
      mcpServers: { "obsidian-mcp": { command: "npx" } },
    });
    vi.mocked(removeMcpEntry).mockReturnValue({
      config: { mcpServers: {} },
      removed: true,
    });
    vi.mocked(removeMarkdownInstruction).mockReturnValue(true);

    const result = teardownClient({
      config: claudeConfig,
      mcpConfigPath: "/home/.claude.json",
      instructionPath: "/home/.claude/CLAUDE.md",
    });

    expect(result.client).toBe("Claude Code");
    expect(result.mcpRemoved).toBe(true);
    expect(result.instructionRemoved).toBe(true);
  });

  it("handles missing config file gracefully", () => {
    mockExists.mockReturnValue(false);
    vi.mocked(removeMarkdownInstruction).mockReturnValue(false);
    const result = teardownClient({
      config: claudeConfig,
      mcpConfigPath: "/home/.claude.json",
      instructionPath: "/home/.claude/CLAUDE.md",
    });
    expect(result.mcpRemoved).toBe(false);
  });

  it("reports nothing removed when entry not found", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({ mcpServers: {} });
    vi.mocked(removeMcpEntry).mockReturnValue({
      config: { mcpServers: {} },
      removed: false,
    });
    vi.mocked(removeMarkdownInstruction).mockReturnValue(false);

    const result = teardownClient({
      config: claudeConfig,
      mcpConfigPath: "/home/.claude.json",
      instructionPath: "/home/.claude/CLAUDE.md",
    });
    expect(result.mcpRemoved).toBe(false);
    expect(result.instructionRemoved).toBe(false);
  });
});
