// SPDX-License-Identifier: AGPL-3.0-or-later
import type { VaultFS } from '../lib/vault-fs.js';
import type { SessionRegistryManager } from '../lib/session-registry.js';
import type { Config } from '../config.js';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface CommandContext {
  vaultFs: VaultFS;
  vaultPath: string;
  sessionRegistry: SessionRegistryManager;
  config: Config;
  log: Logger;
}

export type CommandHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  ctx: CommandContext
) => Promise<TResult>;

export type Middleware = (
  ctx: CommandContext,
  next: () => Promise<unknown>
) => Promise<unknown>;

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface MCPErrorResponse {
  error: string;
  message: string;
}

export interface CommandRegistration<TArgs = unknown, TResult = unknown> {
  handler: CommandHandler<TArgs, TResult>;
  toolDef: MCPToolDefinition;
  adaptArgs?: (raw: Record<string, unknown>) => TArgs;
}
