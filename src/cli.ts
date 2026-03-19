#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import type { Config } from "./config.js";
import { VaultFS } from "./lib/vault-fs.js";
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
import { pruneCommand, statsCommand, deprecateCommand, type RetentionPolicy } from "./commands/prune.js";
import { resumeCommand, formatResumeContext } from "./commands/resume.js";
import type { CommandContext, Logger } from "./core/types.js";

let _config: Config | null = null;
let _vaultFs: VaultFS | null = null;
let _sessionRegistry: SessionRegistryManager | null = null;

function getConfig(): Config {
  if (!_config) _config = loadConfig();
  return _config;
}
function getVaultFs(): VaultFS {
  if (!_vaultFs) _vaultFs = new VaultFS(getConfig().vaultPath);
  return _vaultFs;
}
function getSessionRegistry(): SessionRegistryManager {
  if (!_sessionRegistry) _sessionRegistry = new SessionRegistryManager(getConfig().vaultPath, getConfig().sessionTtlHours);
  return _sessionRegistry;
}

const noopLog: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
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

const program = new Command();

program
  .name("obsidian-mcp")
  .description("Universal agentic knowledge base — CLI backed by Obsidian vault")
  .version("0.1.1");

// ── read ──────────────────────────────────────────────
program
  .command("read <path>")
  .description("Read a vault note")
  .action(async (path: string) => {
    try {
      const content = await readCommand({ path }, createCtx());
      process.stdout.write(content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── list ──────────────────────────────────────────────
program
  .command("list <path>")
  .description("List vault directory")
  .option("-d, --depth <number>", "Listing depth", "1")
  .action(async (path: string, opts: { depth: string }) => {
    try {
      const depth = parseInt(opts.depth, 10);
      if (Number.isNaN(depth) || depth < 1) {
        throw new Error("--depth must be a positive integer");
      }
      const entries = await listCommand({ path, depth }, createCtx());
      for (const entry of entries) {
        console.log(entry);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── write ─────────────────────────────────────────────
program
  .command("write <path>")
  .description("Write/create a vault note")
  .requiredOption("-c, --content <text>", "Note content")
  .option("-m, --mode <mode>", "Write mode: overwrite|append|prepend", "append")
  .option("-f, --frontmatter <json>", "Frontmatter as JSON")
  .action(async (path: string, opts: { content: string; mode: string; frontmatter?: string }) => {
    try {
      const validModes = ["overwrite", "append", "prepend"] as const;
      if (!validModes.includes(opts.mode as any)) {
        throw new Error(`--mode must be one of: ${validModes.join(", ")}`);
      }
      let fm: Record<string, unknown> | undefined;
      if (opts.frontmatter) {
        try {
          fm = JSON.parse(opts.frontmatter);
        } catch {
          throw new Error(`Invalid JSON in --frontmatter: ${opts.frontmatter}`);
        }
      }
      const result = await writeCommand({
        path,
        content: opts.content,
        mode: opts.mode as "overwrite" | "append" | "prepend",
        frontmatter: fm,
      }, createCtx());
      console.log(JSON.stringify(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── append ────────────────────────────────────────────
program
  .command("append <path>")
  .description("Append to an existing vault note")
  .requiredOption("-c, --content <text>", "Content to append")
  .action(async (path: string, opts: { content: string }) => {
    try {
      const result = await writeCommand({ path, content: opts.content, mode: "append" }, createCtx());
      console.log(JSON.stringify(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── search ────────────────────────────────────────────
program
  .command("search <query>")
  .description("Search the vault")
  .option("-p, --project <slug>", "Restrict to project")
  .option("-l, --limit <number>", "Max results", "10")
  .option("-s, --structured", "Structured frontmatter search")
  .action(async (query: string, opts: { project?: string; limit: string; structured?: boolean }) => {
    try {
      const limit = parseInt(opts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      const results = await searchCommand({
        query,
        project: opts.project,
        limit,
        structured: opts.structured,
      }, createCtx());
      console.log(JSON.stringify(results, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── context ───────────────────────────────────────────
program
  .command("context")
  .description("Get project context (auto-detects from cwd)")
  .option("-p, --project <slug>", "Project slug")
  .option("-d, --detail <level>", "Detail level: summary|full", "summary")
  .action(async (opts: { project?: string; detail: string }) => {
    try {
      const validDetails = ["summary", "full"] as const;
      if (!validDetails.includes(opts.detail as any)) {
        throw new Error(`--detail must be one of: ${validDetails.join(", ")}`);
      }
      const result = await contextCommand({
        project: opts.project,
        detailLevel: opts.detail as "summary" | "full",
      }, createCtx());
      console.log(result.context_md);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── init ──────────────────────────────────────────────
program
  .command("init <project-path>")
  .description("Scan a git repo and generate draft context.md")
  .option("-s, --slug <name>", "Project slug (default: directory name)")
  .action(async (projectPath: string, opts: { slug?: string }) => {
    try {
      const result = await initCommand(projectPath, opts.slug);
      process.stdout.write(result.draft_context_md);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── decide ────────────────────────────────────────────
program
  .command("decide")
  .description("Log an architecture decision record")
  .requiredOption("-t, --title <text>", "Decision title")
  .requiredOption("--decision <text>", "What was decided")
  .option("--context <text>", "Why this decision was needed", "")
  .option("--alternatives <text>", "Alternatives considered")
  .option("--consequences <text>", "Known trade-offs")
  .option("-p, --project <slug>", "Project slug")
  .action(async (opts) => {
    try {
      const result = await decideCommand({
        title: opts.title,
        context: opts.context,
        decision: opts.decision,
        alternatives: opts.alternatives,
        consequences: opts.consequences,
        project: opts.project,
      }, createCtx());
      console.log(JSON.stringify(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── todo (deprecated — use task) ─────────────────────
const todoCmd = program
  .command("todo")
  .description("[Deprecated — use 'task' instead] Manage project todos");

todoCmd
  .command("list")
  .description("List active todos")
  .option("-p, --project <slug>", "Project slug")
  .option("-b, --blockers-only", "Only show high-priority blockers")
  .action(async (opts: { project?: string; blockersOnly?: boolean }) => {
    try {
      const result = await todoCommand({
        action: "list",
        project: opts.project,
        blockersOnly: opts.blockersOnly,
      }, createCtx());
      for (const todo of result.todos) {
        const marker = todo.completed ? "[x]" : "[ ]";
        const priority = todo.priority === "high" ? "P0" : todo.priority === "low" ? "P2" : "P1";
        console.log(`${marker} [${priority}] ${todo.text}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

todoCmd
  .command("add <text>")
  .description("Add a todo")
  .option("-p, --project <slug>", "Project slug")
  .option("--priority <level>", "Priority: high|medium|low", "medium")
  .action(async (text: string, opts: { project?: string; priority: string }) => {
    try {
      const validTodoPriorities = ["high", "medium", "low"] as const;
      if (!validTodoPriorities.includes(opts.priority as any)) {
        throw new Error(`--priority must be one of: ${validTodoPriorities.join(", ")}`);
      }
      await todoCommand({
        action: "add",
        item: text,
        priority: opts.priority as "high" | "medium" | "low",
        project: opts.project,
      }, createCtx());
      console.log(`Added: ${text}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

todoCmd
  .command("complete <text>")
  .description("Complete a todo")
  .option("-p, --project <slug>", "Project slug")
  .action(async (text: string, opts: { project?: string }) => {
    try {
      await todoCommand({
        action: "complete",
        item: text,
        project: opts.project,
      }, createCtx());
      console.log(`Completed: ${text}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── task ──────────────────────────────────────────────
const taskCmd = program
  .command("task")
  .description("Manage project tasks (kanban board)");

taskCmd
  .command("list")
  .description("List tasks")
  .option("-p, --project <slug>", "Project slug")
  .option("-s, --status <status>", "Filter by status")
  .option("--priority <level>", "Filter by priority")
  .option("--assigned-to <tool>", "Filter by assignee")
  .action(async (opts: { project?: string; status?: string; priority?: string; assignedTo?: string }) => {
    try {
      const validPriorities = ["p0", "p1", "p2"] as const;
      const validStatuses = ["backlog", "in-progress", "blocked", "done", "cancelled"] as const;
      if (opts.priority && !validPriorities.includes(opts.priority as any)) {
        throw new Error(`--priority must be one of: ${validPriorities.join(", ")}`);
      }
      if (opts.status && !validStatuses.includes(opts.status as any)) {
        throw new Error(`--status must be one of: ${validStatuses.join(", ")}`);
      }
      const result = await taskCommand({
        action: "list",
        project: opts.project,
        status: opts.status as TaskStatus | undefined,
        priority: opts.priority as TaskPriority | undefined,
        assignedTo: opts.assignedTo,
      }, createCtx());
      if (!result.tasks?.length) {
        console.log("No tasks found.");
        return;
      }
      for (const t of result.tasks) {
        const blocked = t.blocked_by.length > 0 ? " [BLOCKED]" : "";
        console.log(`[${t.id}] [${t.priority}] [${t.status}]${blocked} ${t.title}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

taskCmd
  .command("add <title>")
  .description("Add a task")
  .option("-p, --project <slug>", "Project slug")
  .option("--priority <level>", "Priority: p0|p1|p2", "p1")
  .option("--blocked-by <ids...>", "Task IDs that block this task")
  .option("--assigned-to <tool>", "Assignee: claude-code|opencode|codex|human")
  .option("--tags <tags>", "Comma-separated tags")
  .action(async (title: string, opts: { project?: string; priority: string; blockedBy?: string[]; assignedTo?: string; tags?: string }) => {
    try {
      const validPriorities = ["p0", "p1", "p2"] as const;
      if (!validPriorities.includes(opts.priority as any)) {
        throw new Error(`--priority must be one of: ${validPriorities.join(", ")}`);
      }
      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()) : undefined;
      const result = await taskCommand({
        action: "add",
        title,
        project: opts.project,
        priority: opts.priority as TaskPriority,
        blockedBy: opts.blockedBy,
        assignedTo: opts.assignedTo,
        tags,
      }, createCtx());
      console.log(JSON.stringify({ task_id: result.task_id, path: result.path }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

taskCmd
  .command("update <task-id>")
  .description("Update a task")
  .option("-p, --project <slug>", "Project slug")
  .option("-s, --status <status>", "New status")
  .option("--priority <level>", "New priority")
  .option("--blocked-by <ids...>", "New blocked-by list")
  .option("--assigned-to <tool>", "New assignee")
  .option("-t, --title <text>", "New title")
  .action(async (taskId: string, opts: { project?: string; status?: string; priority?: string; blockedBy?: string[]; assignedTo?: string; title?: string }) => {
    try {
      const validPriorities = ["p0", "p1", "p2"] as const;
      const validStatuses = ["backlog", "in-progress", "blocked", "done", "cancelled"] as const;
      if (opts.priority && !validPriorities.includes(opts.priority as any)) {
        throw new Error(`--priority must be one of: ${validPriorities.join(", ")}`);
      }
      if (opts.status && !validStatuses.includes(opts.status as any)) {
        throw new Error(`--status must be one of: ${validStatuses.join(", ")}`);
      }
      const result = await taskCommand({
        action: "update",
        taskId,
        project: opts.project,
        status: opts.status as TaskStatus | undefined,
        priority: opts.priority as TaskPriority | undefined,
        blockedBy: opts.blockedBy,
        assignedTo: opts.assignedTo,
        title: opts.title,
      }, createCtx());
      console.log(JSON.stringify({ task_id: result.task_id, updated_fields: result.updated_fields }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

taskCmd
  .command("board")
  .description("Show task board (kanban view)")
  .option("-p, --project <slug>", "Project slug")
  .action(async (opts: { project?: string }) => {
    try {
      const result = await taskCommand({
        action: "board",
        project: opts.project,
      }, createCtx());
      if (!result.board) return;

      for (const [status, tasks] of Object.entries(result.board)) {
        if (tasks.length === 0) continue;
        console.log(`\n=== ${status.toUpperCase()} (${tasks.length}) ===`);
        for (const t of tasks) {
          const blocked = t.blocked_by.length > 0 ? " [BLOCKED]" : "";
          const assignee = t.assigned_to ? ` @${t.assigned_to}` : "";
          console.log(`  [${t.id}] [${t.priority}]${blocked}${assignee} ${t.title}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── learn ─────────────────────────────────────────────
const learnCmd = program
  .command("learn")
  .description("Capture and query learnings");

learnCmd
  .command("add")
  .description("Capture a learning")
  .requiredOption("-t, --title <text>", "Learning title")
  .requiredOption("-d, --discovery <text>", "What was discovered")
  .option("-p, --project <slug>", "Project slug")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--confidence <level>", "Confidence: high|medium|low", "medium")
  .option("--source <tool>", "Source tool")
  .action(async (opts: { title: string; discovery: string; project?: string; tags?: string; confidence: string; source?: string }) => {
    try {
      const validConfidences = ["high", "medium", "low"] as const;
      if (!validConfidences.includes(opts.confidence as any)) {
        throw new Error(`--confidence must be one of: ${validConfidences.join(", ")}`);
      }
      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()) : undefined;
      const result = await learnCommand({
        action: "add",
        title: opts.title,
        discovery: opts.discovery,
        project: opts.project,
        tags,
        confidence: opts.confidence as Confidence,
        source: opts.source,
      }, createCtx());
      console.log(JSON.stringify({ learning_id: result.learning_id, path: result.path }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

learnCmd
  .command("list")
  .description("List learnings")
  .option("-p, --project <slug>", "Project slug")
  .option("--tag <tag>", "Filter by tag")
  .action(async (opts: { project?: string; tag?: string }) => {
    try {
      const result = await learnCommand({
        action: "list",
        project: opts.project,
        tag: opts.tag,
      }, createCtx());
      if (!result.learnings?.length) {
        console.log(JSON.stringify({ learnings: [] }));
        return;
      }
      if (process.stdout.isTTY) {
        for (const l of result.learnings) {
          const tagStr = l.tags.length > 0 ? ` (${l.tags.join(", ")})` : "";
          console.log(`[${l.id}] [${l.confidence}] ${l.title}${tagStr} — ${l.created}`);
        }
      } else {
        console.log(JSON.stringify({ learnings: result.learnings }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── brainstorm ────────────────────────────────────────
program
  .command("brainstorm <topic>")
  .description("Start or continue a brainstorm")
  .requiredOption("-c, --content <text>", "Brainstorm content to add")
  .option("-p, --project <slug>", "Project slug")
  .action(async (topic: string, opts: { content: string; project?: string }) => {
    try {
      const result = await brainstormCommand({
        topic,
        content: opts.content,
        project: opts.project,
      }, createCtx());
      console.log(JSON.stringify(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── session ───────────────────────────────────────────
const sessionCmd = program
  .command("session")
  .description("Manage agent sessions (swarming coordination)");

sessionCmd
  .command("register")
  .description("Register a new agent session")
  .requiredOption("--tool <name>", "Tool name: claude-code|opencode|codex")
  .option("-p, --project <slug>", "Project being worked on")
  .option("--task <summary>", "Task summary")
  .option("--files <paths...>", "Files being touched")
  .action(async (opts: { tool: string; project?: string; task?: string; files?: string[] }) => {
    try {
      const result = await sessionCommand({
        action: "register",
        tool: opts.tool,
        project: opts.project,
        taskSummary: opts.task,
        filesTouched: opts.files,
      }, createCtx());
      console.log(JSON.stringify(result, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("heartbeat <session-id>")
  .description("Update session heartbeat")
  .action(async (sessionId: string) => {
    try {
      await sessionCommand({ action: "heartbeat", sessionId }, createCtx());
      console.log("Heartbeat updated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("complete <session-id>")
  .description("Mark session as completed")
  .option("--summary <text>", "Session summary")
  .option("--outcome <text>", "Session outcome")
  .option("--files <paths...>", "Files touched during session")
  .option("--tasks <ids...>", "Task IDs completed")
  .option("-p, --project <slug>", "Project slug")
  .action(async (sessionId: string, opts: { summary?: string; outcome?: string; files?: string[]; tasks?: string[]; project?: string }) => {
    try {
      const result = await sessionCommand({
        action: "complete",
        sessionId,
        taskSummary: opts.summary,
        outcome: opts.outcome,
        filesTouched: opts.files,
        tasksCompleted: opts.tasks,
        project: opts.project,
      }, createCtx());
      console.log("Session completed");
      if (result.session_note_path) {
        console.log(`Session note: ${result.session_note_path}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("list")
  .description("List active sessions")
  .action(async () => {
    try {
      const result = await sessionCommand({ action: "list_active" }, createCtx());
      if (!result.active_sessions?.length) {
        console.log("No active sessions");
        return;
      }
      for (const s of result.active_sessions) {
        console.log(`[${s.tool}] ${s.project ?? "unknown"}: ${s.task_summary ?? "no task"} (${s.id})`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── graph ─────────────────────────────────────────────
const graphCmd = program
  .command("graph")
  .description("Knowledge graph traversal");

graphCmd
  .command("related <path>")
  .description("Get backlinks and outgoing links for a note")
  .option("--hops <number>", "Traversal depth", "1")
  .action(async (path: string, opts: { hops: string }) => {
    try {
      const hops = parseInt(opts.hops, 10);
      if (Number.isNaN(hops) || hops < 1) {
        throw new Error("--hops must be a positive integer");
      }
      const result = await graphRelatedCommand({ path, hops }, createCtx());
      console.log(JSON.stringify(result, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

graphCmd
  .command("cross-project <query>")
  .description("Search across all projects")
  .option("-l, --limit <number>", "Max results", "20")
  .action(async (query: string, opts: { limit: string }) => {
    try {
      const limit = parseInt(opts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      const grouped = await graphCrossProjectCommand({ query, limit }, createCtx());
      for (const [project, results] of Object.entries(grouped)) {
        console.log(`\n${project} (${results.length} matches):`);
        for (const r of results) {
          console.log(`  ${r.path}: ${r.snippet.slice(0, 100)}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── prune ─────────────────────────────────────────────
program
  .command("prune")
  .description("Archive or delete stale vault content")
  .option("-p, --project <slug>", "Project slug")
  .option("-a, --all", "Prune all projects")
  .option("-m, --mode <mode>", "Mode: dry-run|archive|delete", "dry-run")
  .option("--sessions <days>", "Session retention in days", "30")
  .option("--done-tasks <days>", "Done task retention in days", "30")
  .option("--todos <days>", "Completed todo retention in days (0=keep)", "0")
  .action(async (opts: { project?: string; all?: boolean; mode: string; sessions: string; doneTasks: string; todos: string }) => {
    try {
      const validModes = ["dry-run", "archive", "delete"] as const;
      if (!validModes.includes(opts.mode as any)) {
        throw new Error(`--mode must be one of: ${validModes.join(", ")}`);
      }
      const policy: Partial<RetentionPolicy> = {
        sessions: parseInt(opts.sessions, 10) || 30,
        doneTasks: parseInt(opts.doneTasks, 10) || 30,
        todos: parseInt(opts.todos, 10) || 0,
      };
      const results = await pruneCommand({
        project: opts.project,
        mode: opts.mode as "dry-run" | "archive" | "delete",
        policy,
        all: opts.all,
      }, createCtx());
      for (const r of results) {
        console.log(`\n=== ${r.project} ===`);
        console.log(`  Scanned: ${r.stats.sessions_scanned} sessions, ${r.stats.tasks_scanned} tasks`);
        if (r.archived.length > 0) {
          console.log(`  ${opts.mode === "dry-run" ? "Would archive" : "Archived"}: ${r.archived.length} items`);
          for (const a of r.archived) console.log(`    ${a.from} → ${a.to}`);
        }
        if (r.deleted.length > 0) {
          console.log(`  ${opts.mode === "dry-run" ? "Would delete" : "Deleted"}: ${r.deleted.length} items`);
          for (const d of r.deleted) console.log(`    ${d}`);
        }
        if (r.archived.length === 0 && r.deleted.length === 0) {
          console.log("  Nothing to prune.");
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── stats ─────────────────────────────────────────────
program
  .command("stats")
  .description("Show vault content statistics for a project")
  .option("-p, --project <slug>", "Project slug")
  .action(async (opts: { project?: string }) => {
    try {
      const result = await statsCommand({ project: opts.project }, createCtx());
      console.log(`\n=== ${result.project} ===`);
      console.log(`  Sessions:    ${result.sessions}`);
      console.log(`  Tasks:       ${result.tasks.total} (backlog: ${result.tasks.backlog}, in-progress: ${result.tasks.inProgress}, done: ${result.tasks.done}, cancelled: ${result.tasks.cancelled})`);
      console.log(`  Learnings:   ${result.learnings}`);
      console.log(`  ADRs:        ${result.adrs}`);
      console.log(`  Brainstorms: ${result.brainstorms}`);
      console.log(`  Total files: ${result.totalFiles}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── deprecate ─────────────────────────────────────────
program
  .command("deprecate <path>")
  .description("Mark a vault item as deprecated")
  .option("-r, --reason <text>", "Reason for deprecation")
  .action(async (path: string, opts: { reason?: string }) => {
    try {
      const result = await deprecateCommand({ path, reason: opts.reason }, createCtx());
      console.log(`Deprecated: ${result.path} (status: ${result.status})`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── resume ────────────────────────────────────────────
program
  .command("resume")
  .description("Get resume context for continuing work — shows recent sessions, interrupted work, next steps")
  .option("-p, --project <slug>", "Project slug")
  .option("-l, --limit <number>", "Number of recent sessions to show", "5")
  .option("--json", "Output as JSON instead of markdown")
  .action(async (opts: { project?: string; limit: string; json?: boolean }) => {
    try {
      const limit = parseInt(opts.limit, 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      const result = await resumeCommand({ project: opts.project, limit }, createCtx());
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatResumeContext(result));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

program.parse();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
