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
import { initCommand } from "./commands/init.js";
import { taskCommand, type TaskStatus, type TaskPriority } from "./commands/task.js";
import { learnCommand, type Confidence } from "./commands/learn.js";

let _config: ReturnType<typeof loadConfig> | null = null;
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

const server = new Server(
  { name: "obsidian-kb", version: "0.2.0" },
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
      name: "vault_init",
      description: "Scan a git repo and generate a draft context.md. Returns the draft — does NOT write to vault. Human reviews before committing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          project_path: { type: "string", description: "Absolute path to the git repository to scan" },
          slug: { type: "string", description: "Project slug (default: derived from directory name)" },
        },
        required: ["project_path"],
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
      name: "vault_task",
      description: "Manage project tasks. Supports add, list, update, and board (kanban) views. Tasks are stored as individual files in projects/<slug>/tasks/.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["add", "list", "update", "board"], description: "Task action" },
          title: { type: "string", description: "Task title (required for add)" },
          task_id: { type: "string", description: "Task ID e.g. task-001 (required for update)" },
          status: { type: "string", enum: ["backlog", "in-progress", "blocked", "done", "cancelled"], description: "Task status" },
          priority: { type: "string", enum: ["p0", "p1", "p2"], description: "Task priority (default p1)" },
          blocked_by: { type: "array", items: { type: "string" }, description: "Task IDs that block this task" },
          assigned_to: { type: "string", description: "Assignee: claude-code|opencode|codex|human" },
          tags: { type: "array", items: { type: "string" }, description: "Tags" },
          project: { type: "string", description: "Project slug (auto-detected if omitted)" },
        },
        required: ["action"],
      },
    },
    {
      name: "vault_learn",
      description: "Capture and query learnings. Learnings persist discoveries across sessions. Stored as individual files in projects/<slug>/learnings/.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["add", "list"], description: "Learning action" },
          title: { type: "string", description: "Learning title (required for add)" },
          discovery: { type: "string", description: "What was discovered (required for add)" },
          project: { type: "string", description: "Project slug (auto-detected if omitted)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags" },
          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence level (default medium)" },
          source: { type: "string", description: "Source tool" },
          session_id: { type: "string", description: "Session ID that captured this learning" },
          tag: { type: "string", description: "Filter learnings by tag (for list)" },
        },
        required: ["action"],
      },
    },
    {
      name: "vault_todo",
      description: "[Deprecated — use vault_task] Read or modify the project todo list.",
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
      description: "Register, update, or query active agent sessions for multi-agent coordination. On complete, persists a session note to the vault.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["register", "heartbeat", "complete", "list_active"], description: "Session action" },
          tool: { type: "string", description: "Tool name: claude-code|opencode|codex" },
          project: { type: "string", description: "Project being worked on" },
          task_summary: { type: "string", description: "What this session is doing" },
          files_touched: { type: "array", items: { type: "string" }, description: "Files this session modifies" },
          session_id: { type: "string", description: "Session ID (for heartbeat/complete)" },
          outcome: { type: "string", description: "Session outcome (for complete)" },
          tasks_completed: { type: "array", items: { type: "string" }, description: "Task IDs completed (for complete)" },
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
          const content = await readCommand(getVaultFs(), path);
          return { content: [{ type: "text", text: content }] };
        } catch (readErr: any) {
          // Only fall through to directory listing on FILE_NOT_FOUND
          if (readErr instanceof VaultError && readErr.code === "FILE_NOT_FOUND") {
            const entries = await listCommand(getVaultFs(), path, depth ?? 1);
            return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
          }
          throw readErr; // Re-throw security and other errors
        }
      }

      case "vault_write": {
        const { path, content, mode, frontmatter } = args as Record<string, unknown>;
        if (!path || typeof path !== "string") {
          throw new Error("Missing required field: path (string)");
        }
        if (content === undefined || content === null || typeof content !== "string") {
          throw new Error("Missing required field: content (string)");
        }
        const result = await writeCommand(getVaultFs(), path as string, content as string, {
          mode: typeof mode === "string" ? mode as "overwrite" | "append" | "prepend" : undefined,
          frontmatter: typeof frontmatter === "object" && frontmatter !== null ? frontmatter as Record<string, unknown> : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_search": {
        const { query, path_filter, mode, limit } = args as Record<string, unknown>;
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
            const results = await searchStructured(getConfig().vaultPath, filters, { limit: typeof limit === "number" ? limit : undefined });
            return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
          }
          const results = await searchText(getConfig().vaultPath, query, {
            pathFilter: typeof path_filter === "string" ? path_filter : undefined,
            limit: typeof limit === "number" ? limit : undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        }
        const results = await searchCommand(getConfig().vaultPath, query, {
          limit: typeof limit === "number" ? limit : undefined,
          structured: mode === "structured",
        });
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "vault_project_context": {
        const { project, detail_level } = args as Record<string, unknown>;
        const result = await contextCommand(getVaultFs(), getConfig().vaultPath, {
          project: typeof project === "string" ? project : undefined,
          detailLevel: typeof detail_level === "string" ? detail_level as "summary" | "full" : undefined,
          maxTokens: getConfig().maxInjectTokens,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_init": {
        const { project_path, slug } = args as { project_path?: unknown; slug?: unknown };
        if (!project_path || typeof project_path !== "string") {
          throw new Error("Missing required field: project_path (string)");
        }
        const result = await initCommand(project_path, typeof slug === "string" ? slug : undefined);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_decide": {
        const { title, context: ctx, decision, alternatives, consequences, project } = args as Record<string, unknown>;
        if (!title || typeof title !== "string") {
          throw new Error("Missing required field: title (string)");
        }
        if (!decision || typeof decision !== "string") {
          throw new Error("Missing required field: decision (string)");
        }
        const result = await decideCommand(getVaultFs(), getConfig().vaultPath, {
          title: title as string,
          context: typeof ctx === "string" ? ctx : "",
          decision: decision as string,
          alternatives: typeof alternatives === "string" ? alternatives : undefined,
          consequences: typeof consequences === "string" ? consequences : undefined,
          project: typeof project === "string" ? project : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_task": {
        const { action, title, task_id, status, priority, blocked_by, assigned_to, tags, project } = args as Record<string, unknown>;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validActions = ["add", "list", "update", "board"] as const;
        if (!validActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`);
        }
        if (action === "add" && (!title || typeof title !== "string")) {
          throw new Error("Missing required field for add: title (string)");
        }
        if (action === "update" && (!task_id || typeof task_id !== "string")) {
          throw new Error("Missing required field for update: task_id (string)");
        }
        const result = await taskCommand(getVaultFs(), getConfig().vaultPath, {
          action: action as "add" | "list" | "update" | "board",
          title: typeof title === "string" ? title : undefined,
          taskId: typeof task_id === "string" ? task_id : undefined,
          status: typeof status === "string" ? status as TaskStatus : undefined,
          priority: typeof priority === "string" ? priority as TaskPriority : undefined,
          blockedBy: Array.isArray(blocked_by) ? blocked_by : undefined,
          assignedTo: typeof assigned_to === "string" ? assigned_to : undefined,
          tags: Array.isArray(tags) ? tags : undefined,
          project: typeof project === "string" ? project : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_learn": {
        const { action, title, discovery, project, tags, confidence, source, session_id, tag } = args as Record<string, unknown>;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validLearnActions = ["add", "list"] as const;
        if (!validLearnActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validLearnActions.join(", ")}`);
        }
        if (action === "add" && (!title || typeof title !== "string")) {
          throw new Error("Missing required field for add: title (string)");
        }
        if (action === "add" && (!discovery || typeof discovery !== "string")) {
          throw new Error("Missing required field for add: discovery (string)");
        }
        const result = await learnCommand(getVaultFs(), getConfig().vaultPath, {
          action: action as "add" | "list",
          title: typeof title === "string" ? title : undefined,
          discovery: typeof discovery === "string" ? discovery : undefined,
          project: typeof project === "string" ? project : undefined,
          tags: Array.isArray(tags) ? tags : undefined,
          confidence: typeof confidence === "string" ? confidence as Confidence : undefined,
          source: typeof source === "string" ? source : undefined,
          sessionId: typeof session_id === "string" ? session_id : undefined,
          tag: typeof tag === "string" ? tag : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_todo": {
        const { action, item, priority, project } = args as Record<string, unknown>;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validTodoActions = ["list", "add", "complete", "remove"] as const;
        if (!validTodoActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validTodoActions.join(", ")}`);
        }
        const result = await todoCommand(getVaultFs(), getConfig().vaultPath, {
          action: action as "list" | "add" | "complete" | "remove",
          item: typeof item === "string" ? item : undefined,
          priority: typeof priority === "string" ? priority as "high" | "medium" | "low" : undefined,
          project: typeof project === "string" ? project : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "vault_brainstorm": {
        const { topic, content, project } = args as Record<string, unknown>;
        if (!topic || typeof topic !== "string") {
          throw new Error("Missing required field: topic (string)");
        }
        if (!content || typeof content !== "string") {
          throw new Error("Missing required field: content (string)");
        }
        const result = await brainstormCommand(getVaultFs(), getConfig().vaultPath, {
          topic: topic as string,
          content: content as string,
          project: typeof project === "string" ? project : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "vault_session": {
        const { action, tool, project, task_summary, files_touched, session_id, outcome, tasks_completed } = args as Record<string, unknown>;
        if (!action || typeof action !== "string") {
          throw new Error("Missing required field: action (string)");
        }
        const validSessionActions = ["register", "heartbeat", "complete", "list_active"] as const;
        if (!validSessionActions.includes(action as any)) {
          throw new Error(`Invalid action: ${action}. Must be one of: ${validSessionActions.join(", ")}`);
        }
        const result = await sessionCommand(getSessionRegistry(), {
          action: action as "register" | "heartbeat" | "complete" | "list_active",
          tool: typeof tool === "string" ? tool : undefined,
          project: typeof project === "string" ? project : undefined,
          taskSummary: typeof task_summary === "string" ? task_summary : undefined,
          filesTouched: Array.isArray(files_touched) ? files_touched : undefined,
          sessionId: typeof session_id === "string" ? session_id : undefined,
          outcome: typeof outcome === "string" ? outcome : undefined,
          tasksCompleted: Array.isArray(tasks_completed) ? tasks_completed : undefined,
        }, getVaultFs());
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
      const sessions = await getSessionRegistry().listActive();
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sessions, null, 2) }],
      };
    }

    // Dynamic project context resources: vault://project/<slug>/context
    const projectMatch = uri.match(/^vault:\/\/project\/([^/]+)\/context$/);
    if (projectMatch) {
      const slug = projectMatch[1];
      const result = await contextCommand(getVaultFs(), getConfig().vaultPath, {
        project: slug,
        detailLevel: "summary",
        maxTokens: getConfig().maxInjectTokens,
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
      const result = await contextCommand(getVaultFs(), getConfig().vaultPath, {
        project,
        detailLevel: "summary",
        maxTokens: getConfig().maxInjectTokens,
      });

      let todoSection = "";
      try {
        const todos = await todoCommand(getVaultFs(), getConfig().vaultPath, {
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
              text: `## Project Context: ${result.project_slug}\n\n${result.context_md}${todoSection}${learningSection}${sessionSection}`,
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server failed to start:", e);
  process.exit(1);
});
