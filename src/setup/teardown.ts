import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import type { DetectedClient, TeardownResult, TeardownOptions } from "./types.js";
import { readJsonConfig, writeJsonConfig, removeMcpEntry } from "./json-config.js";
import { removeTomlBlock } from "./toml-config.js";
import { removeMarkdownInstruction, removeMdcInstruction } from "./instructions.js";
import { CLIENT_REGISTRY } from "./clients.js";
import { detectClient } from "./detect.js";

export function teardownClient(
  detected: DetectedClient,
  options: { dryRun?: boolean } = {}
): TeardownResult {
  const { config, mcpConfigPath, instructionPath } = detected;
  const result: TeardownResult = {
    client: config.name,
    mcpRemoved: false,
    instructionRemoved: false,
  };

  try {
    // 1. Remove MCP entry
    if (config.configFormat === "json") {
      if (options.dryRun) {
        result.mcpRemoved = true;
      } else if (existsSync(mcpConfigPath)) {
        const existing = readJsonConfig(mcpConfigPath);
        if (existing) {
          const { config: updated, removed } = removeMcpEntry(
            existing,
            config.rootKey,
            "obsidian-mcp"
          );
          if (removed) {
            writeJsonConfig(mcpConfigPath, updated);
            result.mcpRemoved = true;
          }
        }
      }
    } else {
      // TOML
      if (options.dryRun) {
        result.mcpRemoved = true;
      } else if (existsSync(mcpConfigPath)) {
        const content = readFileSync(mcpConfigPath, "utf-8");
        const { content: updated, removed } = removeTomlBlock(content);
        if (removed) {
          writeFileSync(mcpConfigPath, updated, "utf-8");
          result.mcpRemoved = true;
        }
      }
    }

    // 2. Remove instruction
    if (config.instructionStrategy === "none") {
      // nothing
    } else if (options.dryRun) {
      result.instructionRemoved = true;
    } else if (config.instructionStrategy === "markdown-file" && instructionPath) {
      result.instructionRemoved = removeMarkdownInstruction(instructionPath);
    } else if (config.instructionStrategy === "mdc-file" && instructionPath) {
      result.instructionRemoved = removeMdcInstruction(instructionPath);
    } else if (config.instructionStrategy === "config-array" && instructionPath) {
      // OpenCode: remove from instructions array + delete instruction file
      if (existsSync(mcpConfigPath)) {
        const existing = readJsonConfig(mcpConfigPath) ?? {};
        const instructions: string[] = existing.instructions ?? [];
        const filtered = instructions.filter((p) => p !== instructionPath);
        if (filtered.length !== instructions.length) {
          existing.instructions = filtered;
          writeJsonConfig(mcpConfigPath, existing);
        }
      }
      if (existsSync(instructionPath)) {
        unlinkSync(instructionPath);
      }
      result.instructionRemoved = true;
    }
  } catch (e: unknown) {
    result.error = (e as Error).message;
  }

  return result;
}

export async function teardownAll(
  options: TeardownOptions = {}
): Promise<TeardownResult[]> {
  const results: TeardownResult[] = [];
  const targets = options.clients
    ? CLIENT_REGISTRY.filter((c) => options.clients!.includes(c.slug))
    : CLIENT_REGISTRY;

  for (const clientConfig of targets) {
    const detected = detectClient(clientConfig);
    if (!detected) continue;
    results.push(teardownClient(detected, { dryRun: options.dryRun }));
  }
  return results;
}
