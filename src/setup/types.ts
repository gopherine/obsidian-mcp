import { platform, homedir } from "os";
import { join } from "path";

export type Platform = "darwin" | "linux" | "win32";

export type InstructionStrategy =
  | "markdown-file"
  | "mdc-file"
  | "config-array"
  | "none";

export interface ClientConfig {
  name: string;
  slug: string;
  mcpConfigPaths: Record<Platform, string>;
  configFormat: "json" | "toml";
  rootKey: string;
  commandType: "string" | "array";
  envKey: string;
  extraFields?: Record<string, unknown>;
  instructionStrategy: InstructionStrategy;
  instructionPaths?: Record<Platform, string>;
  verified: boolean;
}

export interface DetectedClient {
  config: ClientConfig;
  mcpConfigPath: string;
  instructionPath?: string;
}

export interface SetupOptions {
  all?: boolean;
  clients?: string[];
  dryRun?: boolean;
  force?: boolean;
  vaultPath?: string;
}

export interface TeardownOptions {
  clients?: string[];
  dryRun?: boolean;
  silent?: boolean;
}

export interface SetupResult {
  client: string;
  mcpConfigured: boolean;
  instructionConfigured: boolean;
  skipped?: string;
  error?: string;
}

export interface TeardownResult {
  client: string;
  mcpRemoved: boolean;
  instructionRemoved: boolean;
  error?: string;
}

export const INSTRUCTION_TEXT = `You have an Obsidian knowledge base available via MCP (obsidian-mcp).
Always check it at the start of every session:
1. Use vault_project_context to load context for the current project
2. Use vault_search to find relevant decisions, learnings, and tasks
3. Use vault_session to register your session for coordination
Treat the vault as your persistent memory across sessions.`;

export const MARKER_START_HTML = "<!-- obsidian-mcp:start -->";
export const MARKER_END_HTML = "<!-- obsidian-mcp:end -->";
export const MARKER_START_TOML = "# obsidian-mcp:start";
export const MARKER_END_TOML = "# obsidian-mcp:end";

export function resolveHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

export function currentPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "linux";
}
