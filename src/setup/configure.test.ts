import { describe, it, expect } from "vitest";
import { buildMcpEntry } from "./configure.js";

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
