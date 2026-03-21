import { describe, it, expect, vi, beforeEach } from "vitest";
import { readJsonConfig, writeJsonConfig, addMcpEntry, removeMcpEntry } from "./json-config.js";
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "fs";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const mockRead = vi.mocked(readFileSync);
const mockWrite = vi.mocked(writeFileSync);
const mockExists = vi.mocked(existsSync);
const mockCopy = vi.mocked(copyFileSync);
const mockMkdir = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("readJsonConfig", () => {
  it("returns parsed JSON when file exists", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue('{"mcpServers":{}}');
    expect(readJsonConfig("/path/config.json")).toEqual({ mcpServers: {} });
  });

  it("returns empty object when file does not exist", () => {
    mockExists.mockReturnValue(false);
    expect(readJsonConfig("/path/config.json")).toEqual({});
  });

  it("returns null when file has invalid JSON", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue("not json");
    expect(readJsonConfig("/path/config.json")).toBeNull();
  });
});

describe("writeJsonConfig", () => {
  it("creates backup before writing", () => {
    mockExists.mockReturnValue(true);
    writeJsonConfig("/path/config.json", { key: "value" });
    expect(mockCopy).toHaveBeenCalledWith(
      "/path/config.json",
      "/path/config.json.bak.obsidian-mcp"
    );
  });

  it("creates parent directory if missing", () => {
    mockExists.mockReturnValue(false);
    writeJsonConfig("/path/to/config.json", { key: "value" });
    expect(mockMkdir).toHaveBeenCalled();
  });

  it("writes formatted JSON", () => {
    mockExists.mockReturnValue(false);
    writeJsonConfig("/path/config.json", { key: "value" });
    const written = mockWrite.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual({ key: "value" });
  });
});

describe("addMcpEntry", () => {
  it("adds entry under correct root key", () => {
    const config = { mcpServers: {} };
    const result = addMcpEntry(config, "mcpServers", "obsidian-mcp", { command: "npx" });
    expect(result.alreadyExists).toBe(false);
    expect(result.config.mcpServers["obsidian-mcp"]).toEqual({ command: "npx" });
  });

  it("creates root key if missing", () => {
    const config = {};
    const result = addMcpEntry(config, "mcpServers", "obsidian-mcp", { command: "npx" });
    expect(result.config.mcpServers["obsidian-mcp"]).toEqual({ command: "npx" });
  });

  it("preserves existing entries", () => {
    const config = { mcpServers: { other: { command: "other" } } };
    const result = addMcpEntry(config, "mcpServers", "obsidian-mcp", { command: "npx" });
    expect(result.config.mcpServers.other).toEqual({ command: "other" });
    expect(result.config.mcpServers["obsidian-mcp"]).toEqual({ command: "npx" });
  });

  it("returns alreadyExists=true when entry present and force=false", () => {
    const config = { mcpServers: { "obsidian-mcp": { command: "old" } } };
    const result = addMcpEntry(config, "mcpServers", "obsidian-mcp", { command: "npx" }, false);
    expect(result.alreadyExists).toBe(true);
    expect(result.config.mcpServers["obsidian-mcp"]).toEqual({ command: "old" });
  });
});

describe("removeMcpEntry", () => {
  it("removes the entry", () => {
    const config = { mcpServers: { "obsidian-mcp": { command: "npx" }, other: { command: "x" } } };
    const result = removeMcpEntry(config, "mcpServers", "obsidian-mcp");
    expect(result.config.mcpServers["obsidian-mcp"]).toBeUndefined();
    expect(result.config.mcpServers.other).toEqual({ command: "x" });
    expect(result.removed).toBe(true);
  });

  it("returns removed=false when entry not found", () => {
    const config = { mcpServers: {} };
    const result = removeMcpEntry(config, "mcpServers", "obsidian-mcp");
    expect(result.removed).toBe(false);
  });
});
