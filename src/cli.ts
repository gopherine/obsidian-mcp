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

const config = loadConfig();
const vaultFs = new VaultFS(config.vaultPath);
const sessionRegistry = new SessionRegistryManager(config.vaultPath, config.sessionTtlHours);

const program = new Command();

program
  .name("obsidian-kb")
  .description("Universal agentic knowledge base — CLI backed by Obsidian vault")
  .version("0.1.0");

// ── read ──────────────────────────────────────────────
program
  .command("read <path>")
  .description("Read a vault note")
  .action(async (path: string) => {
    try {
      const content = await readCommand(vaultFs, path);
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
      const entries = await listCommand(vaultFs, path, depth);
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
  .option("-m, --mode <mode>", "Write mode: overwrite|append|prepend", "overwrite")
  .option("-f, --frontmatter <json>", "Frontmatter as JSON")
  .action(async (path: string, opts: { content: string; mode: string; frontmatter?: string }) => {
    try {
      const validModes = ["overwrite", "append", "prepend"] as const;
      if (!validModes.includes(opts.mode as any)) {
        throw new Error(`--mode must be one of: ${validModes.join(", ")}`);
      }
      const fm = opts.frontmatter ? JSON.parse(opts.frontmatter) : undefined;
      const result = await writeCommand(vaultFs, path, opts.content, {
        mode: opts.mode as "overwrite" | "append" | "prepend",
        frontmatter: fm,
      });
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
      const result = await writeCommand(vaultFs, path, opts.content, { mode: "append" });
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
      const results = await searchCommand(config.vaultPath, query, {
        project: opts.project,
        limit,
        structured: opts.structured,
      });
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
      const result = await contextCommand(vaultFs, config.vaultPath, {
        project: opts.project,
        detailLevel: opts.detail as "summary" | "full",
        maxTokens: config.maxInjectTokens,
      });
      console.log(result.context_md);
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
      const result = await decideCommand(vaultFs, config.vaultPath, {
        title: opts.title,
        context: opts.context,
        decision: opts.decision,
        alternatives: opts.alternatives,
        consequences: opts.consequences,
        project: opts.project,
      });
      console.log(JSON.stringify(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ── todo ──────────────────────────────────────────────
const todoCmd = program
  .command("todo")
  .description("Manage project todos");

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
      await todoCommand(vaultFs, config.vaultPath, {
        action: "add",
        item: text,
        priority: opts.priority as "high" | "medium" | "low",
        project: opts.project,
      });
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
      await todoCommand(vaultFs, config.vaultPath, {
        action: "complete",
        item: text,
        project: opts.project,
      });
      console.log(`Completed: ${text}`);
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
      const result = await brainstormCommand(vaultFs, config.vaultPath, {
        topic,
        content: opts.content,
        project: opts.project,
      });
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
      const result = await sessionCommand(sessionRegistry, {
        action: "register",
        tool: opts.tool,
        project: opts.project,
        taskSummary: opts.task,
        filesTouched: opts.files,
      });
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
      await sessionCommand(sessionRegistry, { action: "heartbeat", sessionId });
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
  .action(async (sessionId: string, opts: { summary?: string }) => {
    try {
      await sessionCommand(sessionRegistry, {
        action: "complete",
        sessionId,
        taskSummary: opts.summary,
      });
      console.log("Session completed");
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
      const result = await sessionCommand(sessionRegistry, { action: "list_active" });
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
      const result = await graphRelatedCommand(vaultFs, config.vaultPath, path, {
        hops,
      });
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
      const grouped = await graphCrossProjectCommand(config.vaultPath, query, {
        limit,
      });
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

program.parse();
