import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { buildMcpEntry, configureClient } from "./configure.js";
import { readJsonConfig, writeJsonConfig, addMcpEntry } from "./json-config.js";
import { insertTomlBlock } from "./toml-config.js";
import { writeMarkdownInstruction, writeMdcInstruction } from "./instructions.js";
import { CLIENT_REGISTRY } from "./clients.js";
import type { DetectedClient } from "./types.js";

vi.mock("./json-config.js");
vi.mock("./toml-config.js");
vi.mock("./instructions.js");
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
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

describe("buildMcpEntry", () => {
  it("builds string command entry for standard clients", () => {
    const entry = buildMcpEntry("string", "env", "~/Vaults/ai");
    expect(entry).toEqual({
      command: "npx",
      args: ["-y", "@gopherine/obsidian-mcp"],
      env: { VAULT_PATH: "~/Vaults/ai" },
    });
  });

  it("builds array command entry for OpenCode", () => {
    const entry = buildMcpEntry("array", "environment", "~/Vaults/ai", { type: "local" });
    expect(entry).toEqual({
      type: "local",
      command: ["npx", "-y", "@gopherine/obsidian-mcp"],
      environment: { VAULT_PATH: "~/Vaults/ai" },
    });
  });
});

describe("configureClient", () => {
  it("configures JSON client with MCP entry and markdown instruction", () => {
    vi.mocked(readJsonConfig).mockReturnValue({ mcpServers: {} });
    vi.mocked(addMcpEntry).mockReturnValue({ config: { mcpServers: { "obsidian-mcp": {} } }, alreadyExists: false });
    vi.mocked(writeMarkdownInstruction).mockReturnValue("created");

    const result = configureClient(makeDetected("claude-code"), "~/Vaults/ai");
    expect(result.mcpConfigured).toBe(true);
    expect(result.instructionConfigured).toBe(true);
  });

  it("skips when MCP entry already exists", () => {
    vi.mocked(readJsonConfig).mockReturnValue({ mcpServers: { "obsidian-mcp": {} } });
    vi.mocked(addMcpEntry).mockReturnValue({ config: {}, alreadyExists: true });
    vi.mocked(writeMarkdownInstruction).mockReturnValue("exists");

    const result = configureClient(makeDetected("claude-code"), "~/Vaults/ai");
    expect(result.mcpConfigured).toBe(false);
    expect(result.skipped).toContain("already exists");
  });

  it("returns error for invalid JSON", () => {
    vi.mocked(readJsonConfig).mockReturnValue(null);
    const result = configureClient(makeDetected("claude-code"), "~/Vaults/ai");
    expect(result.error).toContain("Invalid JSON");
  });

  it("handles dry run", () => {
    const result = configureClient(makeDetected("claude-code"), "~/Vaults/ai", { dryRun: true });
    expect(result.mcpConfigured).toBe(true);
    expect(result.instructionConfigured).toBe(true);
    expect(writeJsonConfig).not.toHaveBeenCalled();
  });

  it("configures TOML client (Codex)", () => {
    mockExists.mockReturnValue(false);
    vi.mocked(insertTomlBlock).mockReturnValue("toml content");
    vi.mocked(writeMarkdownInstruction).mockReturnValue("created");

    const result = configureClient(makeDetected("codex"), "~/Vaults/ai");
    expect(result.mcpConfigured).toBe(true);
    expect(writeFileSync).toHaveBeenCalled();
  });

  it("skips TOML when block already exists", () => {
    mockExists.mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("existing toml");
    vi.mocked(insertTomlBlock).mockReturnValue(null);
    vi.mocked(writeMarkdownInstruction).mockReturnValue("created");

    const result = configureClient(makeDetected("codex"), "~/Vaults/ai");
    expect(result.skipped).toContain("already exists");
  });

  it("configures mdc-file strategy (Cursor)", () => {
    vi.mocked(readJsonConfig).mockReturnValue({});
    vi.mocked(addMcpEntry).mockReturnValue({ config: {}, alreadyExists: false });

    const result = configureClient(makeDetected("cursor"), "~/Vaults/ai");
    expect(result.instructionConfigured).toBe(true);
    expect(writeMdcInstruction).toHaveBeenCalled();
  });

  it("handles none instruction strategy", () => {
    vi.mocked(readJsonConfig).mockReturnValue({});
    vi.mocked(addMcpEntry).mockReturnValue({ config: {}, alreadyExists: false });

    const result = configureClient(makeDetected("claude-desktop"), "~/Vaults/ai");
    expect(result.mcpConfigured).toBe(true);
    expect(result.instructionConfigured).toBe(false);
  });

  it("configures config-array strategy (OpenCode)", () => {
    vi.mocked(readJsonConfig).mockReturnValue({});
    vi.mocked(addMcpEntry).mockReturnValue({ config: {}, alreadyExists: false });
    mockExists.mockReturnValue(true);

    const result = configureClient(makeDetected("opencode"), "~/Vaults/ai");
    expect(result.instructionConfigured).toBe(true);
    expect(writeFileSync).toHaveBeenCalled();
  });
});
