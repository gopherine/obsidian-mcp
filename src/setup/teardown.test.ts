import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { teardownClient, teardownAll } from "./teardown.js";
import { readJsonConfig, writeJsonConfig, removeMcpEntry } from "./json-config.js";
import { removeTomlBlock } from "./toml-config.js";
import { removeMarkdownInstruction, removeMdcInstruction } from "./instructions.js";
import { CLIENT_REGISTRY } from "./clients.js";
import type { DetectedClient } from "./types.js";

vi.mock("./json-config.js");
vi.mock("./toml-config.js");
vi.mock("./instructions.js");
vi.mock("./detect.js", () => ({
  detectClient: vi.fn().mockReturnValue(null),
}));
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

const mockExists = vi.mocked(existsSync);

beforeEach(() => vi.resetAllMocks());

function makeDetected(slug: string): DetectedClient {
  const config = CLIENT_REGISTRY.find((c) => c.slug === slug)!;
  return {
    config,
    mcpConfigPath: `/home/${slug}/config`,
    instructionPath: `/home/${slug}/instruction`,
  };
}

describe("teardownClient", () => {
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

    const result = teardownClient(makeDetected("claude-code"));
    expect(result.client).toBe("Claude Code");
    expect(result.mcpRemoved).toBe(true);
    expect(result.instructionRemoved).toBe(true);
  });

  it("handles missing config file gracefully", () => {
    mockExists.mockReturnValue(false);
    vi.mocked(removeMarkdownInstruction).mockReturnValue(false);

    const result = teardownClient(makeDetected("claude-code"));
    expect(result.mcpRemoved).toBe(false);
  });

  it("reports nothing removed when entry not found", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({ mcpServers: {} });
    vi.mocked(removeMcpEntry).mockReturnValue({ config: { mcpServers: {} }, removed: false });
    vi.mocked(removeMarkdownInstruction).mockReturnValue(false);

    const result = teardownClient(makeDetected("claude-code"));
    expect(result.mcpRemoved).toBe(false);
    expect(result.instructionRemoved).toBe(false);
  });

  it("handles dry run", () => {
    const result = teardownClient(makeDetected("claude-code"), { dryRun: true });
    expect(result.mcpRemoved).toBe(true);
    expect(result.instructionRemoved).toBe(true);
  });

  it("removes TOML MCP entry (Codex)", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("toml content");
    vi.mocked(removeTomlBlock).mockReturnValue({ content: "clean", removed: true });
    vi.mocked(removeMarkdownInstruction).mockReturnValue(true);

    const result = teardownClient(makeDetected("codex"));
    expect(result.mcpRemoved).toBe(true);
    expect(writeFileSync).toHaveBeenCalled();
  });

  it("removes mdc instruction (Cursor)", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({ mcpServers: {} });
    vi.mocked(removeMcpEntry).mockReturnValue({ config: {}, removed: false });
    vi.mocked(removeMdcInstruction).mockReturnValue(true);

    const result = teardownClient(makeDetected("cursor"));
    expect(result.instructionRemoved).toBe(true);
  });

  it("removes config-array instruction (OpenCode)", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({ instructions: ["/home/opencode/instruction"] });
    vi.mocked(removeMcpEntry).mockReturnValue({ config: {}, removed: false });

    const result = teardownClient(makeDetected("opencode"));
    expect(result.instructionRemoved).toBe(true);
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("handles none instruction strategy", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readJsonConfig).mockReturnValue({});
    vi.mocked(removeMcpEntry).mockReturnValue({ config: {}, removed: false });

    const result = teardownClient(makeDetected("claude-desktop"));
    expect(result.instructionRemoved).toBe(false);
  });
});

describe("teardownAll", () => {
  it("returns empty array when no clients detected", async () => {
    const results = await teardownAll();
    expect(results).toEqual([]);
  });
});
