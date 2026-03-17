#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
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

const config = loadConfig();
const vaultFs = new VaultFS(config.vaultPath);
const sessionRegistry = new SessionRegistryManager(config.vaultPath, config.sessionTtlHours);

const program = new Command();

program
  .name("obsidian-kb")
  .description("Universal agentic knowledge base — CLI backed by Obsidian vault")
  .version("0.2.0");

// ── read ──────────────────────────────────────────────
program
  .command("read <path>")
  .description("Read a vault note")
  .action(async (path: string) => {
    try {
      const content = await readCommand(vaultFs, path);
      process.stdout.write(content);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const entries = await listCommand(vaultFs, path, parseInt(opts.depth, 10));
      for (const entry of entries) {
        console.log(entry);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// ── write ─────────────────────────────────────────────
program
  .command("write <path>")
  .description("Write/create a vault note")
  .requiredOption("-c, --content <text>", "Note content")
  .option("-m, --mode <mode>", "Write mode: overwrite|append|prepend", "overwrite")
  .option("-f, --frontmatter <json>", "Frontmatter as JSON")
  .action(async (path: string, opts: { content: string; mode: string; frontmatter?: string }) => {
    try {
      const fm = opts.frontmatter ? JSON.parse(opts.frontmatter) : undefined;
      const result = await writeCommand(vaultFs, path, opts.content, {
        mode: opts.mode as "overwrite" | "append" | "prepend",
        frontmatter: fm,
      });
      console.log(JSON.stringify(result));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await writeCommand(vaultFs, path, opts.content, { mode: "append" });
      console.log(JSON.stringify(result));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const results = await searchCommand(config.vaultPath, query, {
        project: opts.project,
        limit: parseInt(opts.limit, 10),
        structured: opts.structured,
      });
      console.log(JSON.stringify(results, null, 2));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await contextCommand(vaultFs, config.vaultPath, {
        project: opts.project,
        detailLevel: opts.detail as "summary" | "full",
        maxTokens: config.maxInjectTokens,
      });
      console.log(result.context_md);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await decideCommand(vaultFs, config.vaultPath, {
        title: opts.title,
        context: opts.context,
        decision: opts.decision,
        alternatives: opts.alternatives,
        consequences: opts.consequences,
        project: opts.project,
      });
      console.log(JSON.stringify(result));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await todoCommand(vaultFs, config.vaultPath, {
        action: "list",
        project: opts.project,
        blockersOnly: opts.blockersOnly,
      });
      for (const todo of result.todos) {
        const marker = todo.completed ? "[x]" : "[ ]";
        const priority = todo.priority === "high" ? "P0" : todo.priority === "low" ? "P2" : "P1";
        console.log(`${marker} [${priority}] ${todo.text}`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      await todoCommand(vaultFs, config.vaultPath, {
        action: "add",
        item: text,
        priority: opts.priority as "high" | "medium" | "low",
        project: opts.project,
      });
      console.log(`Added: ${text}`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

todoCmd
  .command("complete <text>")
  .description("Complete a todo")
  .option("-p, --project <slug>", "Project slug")
  .action(async (text: string, opts: { project?: string }) => {
    try {
      await todoCommand(vaultFs, config.vaultPath, {
        action: "complete",
        item: text,
        project: opts.project,
      });
      console.log(`Completed: ${text}`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await taskCommand(vaultFs, config.vaultPath, {
        action: "list",
        project: opts.project,
        status: opts.status as TaskStatus | undefined,
        priority: opts.priority as TaskPriority | undefined,
        assignedTo: opts.assignedTo,
      });
      if (!result.tasks?.length) {
        console.log("No tasks found.");
        return;
      }
      for (const t of result.tasks) {
        const blocked = t.blocked_by.length > 0 ? " [BLOCKED]" : "";
        console.log(`[${t.id}] [${t.priority}] [${t.status}]${blocked} ${t.title}`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()) : undefined;
      const result = await taskCommand(vaultFs, config.vaultPath, {
        action: "add",
        title,
        project: opts.project,
        priority: opts.priority as TaskPriority,
        blockedBy: opts.blockedBy,
        assignedTo: opts.assignedTo,
        tags,
      });
      console.log(JSON.stringify({ task_id: result.task_id, path: result.path }));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await taskCommand(vaultFs, config.vaultPath, {
        action: "update",
        taskId,
        project: opts.project,
        status: opts.status as TaskStatus | undefined,
        priority: opts.priority as TaskPriority | undefined,
        blockedBy: opts.blockedBy,
        assignedTo: opts.assignedTo,
        title: opts.title,
      });
      console.log(JSON.stringify({ task_id: result.task_id, updated_fields: result.updated_fields }));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

taskCmd
  .command("board")
  .description("Show task board (kanban view)")
  .option("-p, --project <slug>", "Project slug")
  .action(async (opts: { project?: string }) => {
    try {
      const result = await taskCommand(vaultFs, config.vaultPath, {
        action: "board",
        project: opts.project,
      });
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
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()) : undefined;
      const result = await learnCommand(vaultFs, config.vaultPath, {
        action: "add",
        title: opts.title,
        discovery: opts.discovery,
        project: opts.project,
        tags,
        confidence: opts.confidence as Confidence,
        source: opts.source,
      });
      console.log(JSON.stringify({ learning_id: result.learning_id, path: result.path }));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await learnCommand(vaultFs, config.vaultPath, {
        action: "list",
        project: opts.project,
        tag: opts.tag,
      });
      if (!result.learnings?.length) {
        console.log(JSON.stringify({ learnings: [] }));
        return;
      }
      // Table format for CLI, JSON for piping
      if (process.stdout.isTTY) {
        for (const l of result.learnings) {
          const tagStr = l.tags.length > 0 ? ` (${l.tags.join(", ")})` : "";
          console.log(`[${l.id}] [${l.confidence}] ${l.title}${tagStr} — ${l.created}`);
        }
      } else {
        console.log(JSON.stringify({ learnings: result.learnings }));
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await brainstormCommand(vaultFs, config.vaultPath, {
        topic,
        content: opts.content,
        project: opts.project,
      });
      console.log(JSON.stringify(result));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await sessionCommand(sessionRegistry, {
        action: "register",
        tool: opts.tool,
        project: opts.project,
        taskSummary: opts.task,
        filesTouched: opts.files,
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("heartbeat <session-id>")
  .description("Update session heartbeat")
  .action(async (sessionId: string) => {
    try {
      await sessionCommand(sessionRegistry, { action: "heartbeat", sessionId });
      console.log("Heartbeat updated");
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await sessionCommand(sessionRegistry, {
        action: "complete",
        sessionId,
        taskSummary: opts.summary,
        outcome: opts.outcome,
        filesTouched: opts.files,
        tasksCompleted: opts.tasks,
        project: opts.project,
      }, vaultFs);
      console.log("Session completed");
      if (result.session_note_path) {
        console.log(`Session note: ${result.session_note_path}`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("list")
  .description("List active sessions")
  .action(async () => {
    try {
      const result = await sessionCommand(sessionRegistry, { action: "list_active" });
      if (!result.active_sessions?.length) {
        console.log("No active sessions");
        return;
      }
      for (const s of result.active_sessions) {
        console.log(`[${s.tool}] ${s.project ?? "unknown"}: ${s.task_summary ?? "no task"} (${s.id})`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
      const result = await graphRelatedCommand(vaultFs, config.vaultPath, path, {
        hops: parseInt(opts.hops, 10),
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

graphCmd
  .command("cross-project <query>")
  .description("Search across all projects")
  .option("-l, --limit <number>", "Max results", "20")
  .action(async (query: string, opts: { limit: string }) => {
    try {
      const grouped = await graphCrossProjectCommand(config.vaultPath, query, {
        limit: parseInt(opts.limit, 10),
      });
      for (const [project, results] of Object.entries(grouped)) {
        console.log(`\n${project} (${results.length} matches):`);
        for (const r of results) {
          console.log(`  ${r.path}: ${r.snippet.slice(0, 100)}`);
        }
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
