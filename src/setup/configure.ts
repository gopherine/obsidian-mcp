import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { DetectedClient, SetupResult } from "./types.js";
import { INSTRUCTION_TEXT } from "./types.js";
import { readJsonConfig, writeJsonConfig, addMcpEntry } from "./json-config.js";
import { insertTomlBlock } from "./toml-config.js";
import {
  writeMarkdownInstruction,
  writeMdcInstruction,
} from "./instructions.js";

export function buildMcpEntry(
  commandType: "string" | "array",
  envKey: string,
  vaultPath: string,
  extraFields?: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...extraFields };

  if (commandType === "array") {
    base.command = ["npx", "-y", "@gopherine/obsidian-mcp"];
  } else {
    base.command = "npx";
    base.args = ["-y", "@gopherine/obsidian-mcp"];
  }

  base[envKey] = { VAULT_PATH: vaultPath };
  return base;
}

function buildTomlBlock(vaultPath: string): string {
  return `[mcp_servers.obsidian-mcp]
command = "npx"
args = ["-y", "@gopherine/obsidian-mcp"]

[mcp_servers.obsidian-mcp.env]
VAULT_PATH = "${vaultPath}"`;
}

export function configureClient(
  detected: DetectedClient,
  vaultPath: string,
  options: { dryRun?: boolean; force?: boolean } = {}
): SetupResult {
  const { config, mcpConfigPath, instructionPath } = detected;
  const result: SetupResult = {
    client: config.name,
    mcpConfigured: false,
    instructionConfigured: false,
  };

  try {
    // 1. Configure MCP entry
    if (config.configFormat === "json") {
      if (options.dryRun) {
        result.mcpConfigured = true;
      } else {
        const existing = readJsonConfig(mcpConfigPath);
        if (existing === null) {
          result.error = `Invalid JSON in ${mcpConfigPath} — skipped`;
          return result;
        }
        const entry = buildMcpEntry(
          config.commandType,
          config.envKey,
          vaultPath,
          config.extraFields
        );
        const merged = addMcpEntry(
          existing,
          config.rootKey,
          "obsidian-mcp",
          entry,
          options.force
        );
        if (merged.alreadyExists) {
          result.skipped = "MCP entry already exists";
        } else {
          writeJsonConfig(mcpConfigPath, merged.config);
          result.mcpConfigured = true;
        }
      }
    } else {
      // TOML (Codex)
      if (options.dryRun) {
        result.mcpConfigured = true;
      } else {
        const content = existsSync(mcpConfigPath)
          ? readFileSync(mcpConfigPath, "utf-8")
          : "";
        const block = buildTomlBlock(vaultPath);
        const updated = insertTomlBlock(content, block, options.force);
        if (updated === null) {
          result.skipped = "MCP entry already exists";
        } else {
          const dir = dirname(mcpConfigPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(mcpConfigPath, updated, "utf-8");
          result.mcpConfigured = true;
        }
      }
    }

    // 2. Configure instruction
    if (config.instructionStrategy === "none") {
      // nothing to do
    } else if (options.dryRun) {
      result.instructionConfigured = true;
    } else if (config.instructionStrategy === "markdown-file" && instructionPath) {
      const status = writeMarkdownInstruction(instructionPath, options.force);
      result.instructionConfigured = status !== "exists";
      if (status === "exists") {
        result.skipped = (result.skipped ? result.skipped + "; " : "") + "Instruction already exists";
      }
    } else if (config.instructionStrategy === "mdc-file" && instructionPath) {
      writeMdcInstruction(instructionPath);
      result.instructionConfigured = true;
    } else if (config.instructionStrategy === "config-array" && instructionPath) {
      // OpenCode: add instruction file path to config + write instruction file
      const configPath = detected.mcpConfigPath;
      const existing = readJsonConfig(configPath);
      if (existing === null) {
        result.error = (result.error ? result.error + "; " : "") +
          `Invalid JSON in ${configPath} — skipped instruction config`;
        return result;
      }
      const instructions: string[] = existing.instructions ?? [];
      if (!instructions.includes(instructionPath)) {
        existing.instructions = [...instructions, instructionPath];
        writeJsonConfig(configPath, existing);
      }
      // Write the instruction file itself
      const dir = dirname(instructionPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(instructionPath, INSTRUCTION_TEXT + "\n", "utf-8");
      result.instructionConfigured = true;
    }
  } catch (e: unknown) {
    result.error = (e as Error).message;
  }

  return result;
}
