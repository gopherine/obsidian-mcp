#!/usr/bin/env node

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
import { VaultFS, VaultError } from "./lib/vault-fs.js";
import { SessionRegistryManager } from "./lib/session-registry.js";
import { readCommand, listCommand } from "./commands/read.js";
import { writeCommand } from "./commands/write.js";
import { searchCommand } from "./commands/search.js";
import { contextCommand } from "./commands/context.js";
import { decideCommand } from "./commands/decide.js";
import { todoCommand } from "./commands/todo.js";
import { brainstormCommand } from "./commands/brainstorm.js";
import { sessionCommand } from "./commands/session.js";
import { graphRelatedCommand, graphCrossProjectCommand } from "./commands/graph.js";

const config = loadConfig();
const vaultFs = new VaultFS(config.vaultPath);
const sessionRegistry = new SessionRegistryManager(config.vaultPath, config.sessionTtlHours);

const server = new Server(
  { name: "obsidian-kb", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ── Tools ─────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "vault_read",
      description: "Read a file or directory listing from the AI knowledge vault.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Relative path within vault. Use '.' for root." },
          depth: { type: "number", description: "Directory listing depth (default 1)" },
        },
        required: ["path"],
      },
    },
    {
      name: "vault_write",
      description: "Write or append to a file in the AI knowledge vault.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Relative path within vault" },
          content: { type: "string", description: "Markdown content to write" },
          mode: { type: "string", enum: ["overwrite", "append", "prepend"], description: "Write mode (default overwrite)" },
          frontmatter: { type: "object", description: "YAML frontmatter key-value pairs" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "vault_search",
      description: "Search across the AI vault. Supports full-text and structured (frontmatter) search.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query or structured filter (e.g. 'type:adr project:permanu')" },
          path_filter: { type: "string", description: "Glob to restrict search scope" },
          mode: { type: "string", enum: ["text", "structured"], description: "Search mode (default text)" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "vault_project_context",
      description: "Get the context document for a project. Auto-detects project from CWD if not specified.",
      inputSchema: {
        type: "object" as const,
        properties: {
          project: { type: "string", description: "Project slug. If omitted, auto-detected from CWD." },
          detail_level: { type: "string", enum: ["summary", "full"], description: "Detail level (default summary)" },
        },
      },
    },
    {
      name: "vault_decide",
      description: "Log an architectural/design decision to the project's decisions directory.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Decision title" },
          context: { type: "string", description: "Why this decision was needed" },
          decision: { type: "string", description: "What was decided" },
          alternatives: { type: "string", description: "Alternatives considered" },
          consequences: { type: "string", description: "Known trade-offs" },
          project: { type: "string", description: "Project slug (auto-detected if omitted)" },
        },
        required: ["title", "decision"],
      },
    },
    {
      name: "vault_todo",
      description: "Read or modify the project todo list.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["list", "add", "complete", "remove"], description: "Action to perform" },
          item: { type: "string", minLength: 1, description: "Todo item text (required for add/complete/remove)" },
          priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority (for add)" },
          project: { type: "string", description: "Project slug (auto-detected if omitted)" },
        },
        required: ["action"],
      },
    },
    {
      name: "vault_brainstorm",
      description: "Start or continue a brainstorm document for a project.",
      inputSchema: {
        type: "object" as const,
        properties: {
          topic: { type: "string", description: "Brainstorm topic (used as filename)" },
          content: { type: "string", description: "Content to add" },
          project: { type: "string", description: "Project slug (auto-detected if omitted)" },
        },
        required: ["topic", "content"],
      },
    },
    {
      name: "vault_session",
      description: "Register, update, or query active agent sessions for multi-agent coordination.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["register", "heartbeat", "complete", "list_active"], description: "Session action" },
          tool: { type: "string", description: "Tool name: claude-code|opencode|codex" },
          project: { type: "string", description: "Project being worked on" },
          task_summary: { type: "string", description: "What this session is doing" },
          files_touched: { type: "array", items: { type: "string" }, description: "Files this session modifies" },
          session_id: { type: "string", description: "Session ID (for heartbeat/complete)" },
        },
        required: ["action"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "vault_read": {
        const { path, depth } = args as { path: string; depth?: number };
        if (!path || typeof path !== "string") {
          throw new Error("Missing required field: path (string)");
        }
        try {
          const content = await readCommand(vaultFs, path);
          return { content: [{ type: "text", text: content }] };
        } catch (readErr: any) {
          // Only fall through to directory listing on FILE_NOT_FOUND
          if (readErr instanceof VaultError && readErr.code === "FILE_NOT_FOUND") {
            const entries = await listCommand(vaultFs, path, depth ?? 1);
            return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
          }
          throw readErr; // Re-throw security and other errors
        }
      }

      case "vault_write": {
        const { path, content, mode, frontmatter } = args as any;
        if (!path || typeof path !== "string") {
          throw new Error("Missing required field: path (string)");
        }
        if (content === undefined || content === null || typeof content !== "string") {
          throw new Error("Missing required field: content (string)");
        }
        const result = await writeCommand(vaultFs, path, content, { mode, frontmatter });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_search": {
        const { query, path_filter, mode, limit } = args as any;
        if (!query || typeof query !== "string") {
          throw new Error("Missing required field: query (string)");
        }
        if (path_filter) {
          // Pass path_filter directly to searchText/searchStructured, not as project
          const { searchText, searchStructured } = await import("./lib/search-engine.js");
          if (mode === "structured") {
            const filters: Record<string, string> = {};
            for (const part of query.split(/\s+/)) {
              const idx = part.indexOf(":");
              if (idx > 0) {
                filters[part.slice(0, idx)] = part.slice(idx + 1);
              }
            }
            const results = await searchStructured(config.vaultPath, filters, { limit });
            return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
          }
          const results = await searchText(config.vaultPath, query, {
            pathFilter: path_filter,
            limit,
          });
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        }
        const results = await searchCommand(config.vaultPath, query, {
          limit,
          structured: mode === "structured",
        });
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "vault_project_context": {
        const { project, detail_level } = args as any;
        const result = await contextCommand(vaultFs, config.vaultPath, {
          project,
          detailLevel: detail_level,
          maxTokens: config.maxInjectTokens,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_decide": {
        const { title, context: ctx, decision, alternatives, consequences, project } = args as any;
        if (!title || typeof title !== "string") {
          throw new Error("Missing required field: title (string)");
        }
        if (!decision || typeof decision !== "string") {
          throw new Error("Missing required field: decision (string)");
        }
        const result = await decideCommand(vaultFs, config.vaultPath, {
          title,
          context: ctx ?? "",
          decision,
          alternatives,
          consequences,
          project,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_todo": {
        const { action, item, priority, project } = args as any;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validTodoActions = ["list", "add", "complete", "remove"] as const;
        if (!validTodoActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validTodoActions.join(", ")}`);
        }
        const result = await todoCommand(vaultFs, config.vaultPath, {
          action: action as "list" | "add" | "complete" | "remove",
          item,
          priority,
          project,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_brainstorm": {
        const { topic, content, project } = args as any;
        if (!topic || typeof topic !== "string") {
          throw new Error("Missing required field: topic (string)");
        }
        if (!content || typeof content !== "string") {
          throw new Error("Missing required field: content (string)");
        }
        const result = await brainstormCommand(vaultFs, config.vaultPath, {
          topic,
          content,
          project,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_session": {
        const { action, tool, project, task_summary, files_touched, session_id } = args as any;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validSessionActions = ["register", "heartbeat", "complete", "list_active"] as const;
        if (!validSessionActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validSessionActions.join(", ")}`);
        }
        const result = await sessionCommand(sessionRegistry, {
          action: action as "register" | "heartbeat" | "complete" | "list_active",
          tool,
          project,
          taskSummary: task_summary,
          filesTouched: files_touched,
          sessionId: session_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
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
      const sessions = await sessionRegistry.listActive();
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sessions, null, 2) }],
      };
    }

    // Dynamic project context resources: vault://project/<slug>/context
    const projectMatch = uri.match(/^vault:\/\/project\/([^/]+)\/context$/);
    if (projectMatch) {
      const slug = projectMatch[1];
      const result = await contextCommand(vaultFs, config.vaultPath, {
        project: slug,
        detailLevel: "summary",
        maxTokens: config.maxInjectTokens,
      });
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
      const result = await contextCommand(vaultFs, config.vaultPath, {
        project,
        detailLevel: "summary",
        maxTokens: config.maxInjectTokens,
      });

      let todoSection = "";
      try {
        const todos = await todoCommand(vaultFs, config.vaultPath, {
          action: "list",
          project: result.project_slug,
          blockersOnly: true,
        });
        if (todos.todos.length > 0) {
          todoSection = "\n\n## Active Blockers\n" +
            todos.todos.map((t) => `- [${t.priority.toUpperCase()}] ${t.text}`).join("\n");
        }
      } catch {
        // No todos file, skip
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `## Project Context: ${result.project_slug}\n\n${result.context_md}${todoSection}`,
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

// ── Start ─────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server failed to start:", e);
  process.exit(1);
});
