#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import type { Config } from "./config.js";
import { VaultFS, VaultError } from "./lib/vault-fs.js";
import { SessionRegistryManager } from "./lib/session-registry.js";
import { createRegistry } from "./core/registry.js";
import type { CommandContext, Logger } from "./core/types.js";
import { readCommand, listCommand } from "./commands/read.js";
import { taskCommand } from "./commands/task.js";
import { searchText, searchStructured } from "./lib/search-engine.js";
import { formatResumeContext } from "./commands/resume.js";
import { getSkillAwarenessBlock } from "./commands/skill/marketplace.js";
import { loadRegistry, mergeLocalSkills } from "./lib/registry-loader.js";
import { setRegistryData } from "./commands/skill/catalog.js";
import { scanInstalledSkills, scannedSkillsToRegistryFormat } from "./lib/skill-scanner.js";

const registry = createRegistry();

let _config: Config | null = null;
let _vaultFs: VaultFS | null = null;
let _sessionRegistry: SessionRegistryManager | null = null;

function getConfig() {
  if (!_config) _config = loadConfig();
  return _config;
}
function getVaultFs() {
  if (!_vaultFs) _vaultFs = new VaultFS(getConfig().vaultPath);
  return _vaultFs;
}
function getSessionRegistry() {
  if (!_sessionRegistry) _sessionRegistry = new SessionRegistryManager(getConfig().vaultPath, getConfig().sessionTtlHours);
  return _sessionRegistry;
}

const noopLog: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
};

function createCtx(): CommandContext {
  return {
    vaultFs: getVaultFs(),
    vaultPath: getConfig().vaultPath,
    sessionRegistry: getSessionRegistry(),
    config: getConfig(),
    log: noopLog,
  };
}

const server = new Server(
  { name: "superskill", version: "0.4.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ── Tools ─────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.getToolDefinitions(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const ctx = createCtx();
  const raw = args as Record<string, unknown>;

  try {
    if (name === "vault_read") {
      const { path, depth } = raw;
      if (!path || typeof path !== "string") throw new Error("Missing required field: path (string)");
      try {
        const content = await readCommand({ path }, ctx);
        return { content: [{ type: "text", text: content }] };
      } catch (readErr: unknown) {
        const code = readErr instanceof VaultError ? readErr.code : undefined;
        const isDir = readErr instanceof Error && "code" in readErr && (readErr as NodeJS.ErrnoException).code === "EISDIR";
        if (code === "FILE_NOT_FOUND" || isDir) {
          const entries = await listCommand({ path, depth: typeof depth === "number" ? depth : 1 }, ctx);
          return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
        }
        throw readErr;
      }
    }

    if (name === "vault_search" && raw.path_filter) {
      const { query, path_filter, mode, limit } = raw;
      if (!query || typeof query !== "string") throw new Error("Missing required field: query (string)");
      if (mode === "structured") {
        const filters: Record<string, string> = {};
        for (const part of (query as string).split(/\s+/)) {
          const idx = part.indexOf(":");
          if (idx > 0) filters[part.slice(0, idx)] = part.slice(idx + 1);
        }
        const results = await searchStructured(ctx.vaultPath, filters, { limit: typeof limit === "number" ? limit : undefined });
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      const results = await searchText(ctx.vaultPath, query as string, {
        pathFilter: typeof path_filter === "string" ? path_filter : undefined,
        limit: typeof limit === "number" ? limit : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    if (name === "vault_todo") {
      const { action, item, priority, project } = raw;
      if (!action || typeof action !== "string") {
        throw new Error("Missing required field: action (string)");
      }
      const validTodoActions = ["list", "add", "complete", "remove"] as const;
      if (!validTodoActions.includes(action as any)) {
        throw new Error(`Invalid action: ${action}. Must be one of: ${validTodoActions.join(", ")}`);
      }

      const priorityMap: Record<string, "p0" | "p1" | "p2"> = { high: "p0", medium: "p1", low: "p2" };
      const taskPriority = priority && typeof priority === "string" && priority in priorityMap
        ? priorityMap[priority]
        : "p1";

      let result: Record<string, unknown>;
      switch (action as "list" | "add" | "complete" | "remove") {
        case "list": {
          const tasks = await taskCommand({
            action: "list",
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          const todos: Array<{ text: string; priority: string; completed: boolean; task_id: string }> = (tasks.tasks ?? []).map((t) => ({
            text: t.title,
            priority: t.priority,
            completed: t.status === "done" || t.status === "cancelled",
            task_id: t.id,
          }));
          result = { todos };
          break;
        }
        case "add": {
          if (!item || typeof item !== "string") {
            throw new Error("Missing required field: item (string)");
          }
          const addResult = await taskCommand({
            action: "add",
            title: item,
            priority: taskPriority,
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          result = { added: true, task_id: addResult.task_id, path: addResult.path };
          break;
        }
        case "complete": {
          if (!item || typeof item !== "string") {
            throw new Error("Missing required field: item (string)");
          }
          const listResult = await taskCommand({
            action: "list",
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          const match = (listResult.tasks ?? []).find((t) => t.title === item);
          if (!match) {
            throw new Error(`Todo not found: ${item}`);
          }
          await taskCommand({
            action: "update",
            taskId: match.id,
            status: "done",
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          result = { completed: true, task_id: match.id };
          break;
        }
        case "remove": {
          if (!item || typeof item !== "string") {
            throw new Error("Missing required field: item (string)");
          }
          const listRes = await taskCommand({
            action: "list",
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          const removeMatch = (listRes.tasks ?? []).find((t) => t.title === item);
          if (!removeMatch) {
            throw new Error(`Todo not found: ${item}`);
          }
          await taskCommand({
            action: "update",
            taskId: removeMatch.id,
            status: "cancelled",
            project: typeof project === "string" ? project : undefined,
          }, ctx);
          result = { removed: true, task_id: removeMatch.id };
          break;
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "vault_resume") {
      const result = await registry.execute(name, raw, ctx);
      if (raw.format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      return { content: [{ type: "text", text: formatResumeContext(result as any) }] };
    }

    const result = await registry.execute(name, raw, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e: unknown) {
    const code = e instanceof VaultError ? e.code : "INTERNAL_ERROR";
    const msg = e instanceof Error ? e.message : String(e);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: code, message: msg }) }],
      isError: true,
    };
  }
});

// ── Resources ─────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "vault://coordination/active-sessions",
      name: "Active Sessions",
      description: "Currently active agent sessions across all tools",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    if (uri === "vault://coordination/active-sessions") {
      const sessions = await getSessionRegistry().listActive();
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sessions, null, 2) }],
      };
    }

    const projectMatch = uri.match(/^vault:\/\/project\/([^/]+)\/context$/);
    if (projectMatch) {
      const slug = projectMatch[1];
      const ctx = createCtx();
      const result = await registry.execute("vault_project_context", { project: slug, detail_level: "summary" }, ctx) as any;
      return {
        contents: [{ uri, mimeType: "text/markdown", text: result.context_md }],
      };
    }

    return {
      contents: [{ uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` }],
      isError: true,
    } as any;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      contents: [{ uri, mimeType: "text/plain", text: JSON.stringify({ error: "INTERNAL_ERROR", message: msg }) }],
      isError: true,
    } as any;
  }
});

// ── Prompts ───────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "inject-project-context",
      description: "Returns a system prompt fragment with project context, recent decisions, and active todos.",
      arguments: [
        { name: "project", description: "Project slug (auto-detected if omitted)", required: false },
      ],
    },
    {
      name: "summarize-session",
      description: "Returns a prompt guiding the agent to produce a structured session summary.",
      arguments: [
        { name: "project", description: "Project slug", required: false },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "inject-project-context") {
      const project = args?.project as string | undefined;
      const ctx = createCtx();
      const result = await registry.execute("vault_project_context", {
        project,
        detail_level: "summary",
      }, ctx) as any;

      let todoSection = "";
      try {
        const tasks = await taskCommand({
          action: "list",
          project: result.project_slug,
          status: "blocked",
        }, ctx);
        if (tasks.tasks && tasks.tasks.length > 0) {
          todoSection = "\n\n## Active Blockers\n" +
            tasks.tasks.map((t) => `- [${t.priority.toUpperCase()}] ${t.title} (${t.id})`).join("\n");
        }
      } catch {
      }

      let learningSection = "";
      if (result.learning_count > 0) {
        learningSection = `\n\n## Learnings: ${result.learning_count} available (use vault_learn list)`;
      }

      let sessionSection = "";
      if (result.last_session) {
        const ago = getTimeAgo(result.last_session.completed_at);
        sessionSection = `\n\n## Last Session (${ago}): ${result.last_session.outcome}`;
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `## Project Context: ${result.project_slug}\n\n${result.context_md}${todoSection}${learningSection}${sessionSection}${getSkillAwarenessBlock()}`,
            },
          },
        ],
      };
    }

    if (name === "summarize-session") {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please summarize this session in the following format for the knowledge vault:

## Session Summary

**Project**: ${args?.project ?? "[auto-detect]"}
**Date**: ${new Date().toISOString().slice(0, 10)}
**Tool**: [which AI tool was used]

### What was done
- [bullet points of completed work]

### Decisions made
- [any architectural or design decisions, with reasoning]

### Open items
- [anything left incomplete or requiring follow-up]

### Files modified
- [list of files changed]`,
            },
          },
        ],
      };
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Unknown prompt: ${name}`,
          },
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Error loading prompt "${name}": ${msg}`,
          },
        },
      ],
    };
  }
});

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// ── Start ─────────────────────────────────────────────

async function main() {
  // Load the skill registry and scan installed skills
  try {
    let registry = await loadRegistry();

    // Scan locally installed skills (from skills.sh / npx skills add)
    const scanned = await scanInstalledSkills();
    if (scanned.skills.length > 0) {
      const localSkills = scannedSkillsToRegistryFormat(scanned.skills);
      registry = mergeLocalSkills(registry, localSkills);
    }

    setRegistryData(registry);
  } catch {
    // Non-fatal: catalog.ts fallbacks will be used
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server failed to start:", e);
  process.exit(1);
});
