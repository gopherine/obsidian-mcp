import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry } from "./registry.js";
import { VaultError } from "../lib/vault-fs.js";
import type { CommandContext, CommandHandler, CommandRegistration, MCPToolDefinition } from "./types.js";

function createMockContext(): CommandContext {
  return {
    vaultFs: {} as any,
    vaultPath: "/tmp/test-vault",
    config: {} as any,
    sessionRegistry: {} as any,
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

function createMockVaultFs(readResult?: string): any {
  return {
    root: "/tmp/test-vault",
    read: vi.fn().mockResolvedValue(readResult ?? ""),
    write: vi.fn().mockResolvedValue({ path: "test", bytes: 0 }),
    list: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
    verifyNoSymlinkEscape: vi.fn().mockResolvedValue(undefined),
    append: vi.fn().mockResolvedValue({ path: "test", bytes: 0 }),
  };
}

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let ctx: CommandContext;

  beforeEach(() => {
    registry = new CommandRegistry();
    ctx = createMockContext();
  });

  describe("register and get", () => {
    it("stores and retrieves a registration", () => {
      const handler: CommandHandler = async () => null;
      const toolDef: MCPToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: { type: "object" },
      };
      const reg: CommandRegistration = { handler, toolDef };

      registry.register("test", reg);
      expect(registry.get("test")).toBe(reg);
      expect(registry.has("test")).toBe(true);
      expect(registry.has("missing")).toBe(false);
    });

    it("returns undefined for unknown command", () => {
      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  describe("execute", () => {
    it("executes a registered command handler", async () => {
      const handler = async (args: { name: string }) => `Hello, ${args.name}!`;
      const reg: CommandRegistration = {
        handler: handler as CommandHandler,
        toolDef: { name: "greet", description: "Greet", inputSchema: {} },
      };

      registry.register("greet", reg);
      const result = await registry.execute("greet", { name: "World" }, ctx);
      expect(result).toBe("Hello, World!");
    });

    it("uses adaptArgs to transform raw arguments", async () => {
      const handler = async (args: { camelCase: string }) => args.camelCase;
      const reg: CommandRegistration = {
        handler: handler as CommandHandler,
        toolDef: { name: "adapt", description: "Adapt", inputSchema: {} },
        adaptArgs: (raw: Record<string, unknown>) => ({ camelCase: raw.snake_case as string }),
      };

      registry.register("adapt", reg);
      const result = await registry.execute("adapt", { snake_case: "value" }, ctx);
      expect(result).toBe("value");
    });

    it("throws for unknown command", async () => {
      await expect(registry.execute("unknown", {}, ctx)).rejects.toThrow("Unknown command: unknown");
    });

    it("passes context through to handler", async () => {
      let receivedCtx: CommandContext | null = null;
      const handler: CommandHandler = async (_args, ctx) => {
        receivedCtx = ctx;
        return "done";
      };
      const reg: CommandRegistration = {
        handler,
        toolDef: { name: "ctx-test", description: "Ctx", inputSchema: {} },
      };

      registry.register("ctx-test", reg);
      await registry.execute("ctx-test", {}, ctx);
      expect(receivedCtx).toBe(ctx);
    });

    it("passes through errors from handlers", async () => {
      const handler: CommandHandler = async () => {
        throw new VaultError("FILE_NOT_FOUND", "not here");
      };
      const reg: CommandRegistration = {
        handler,
        toolDef: { name: "error-test", description: "Error", inputSchema: {} },
      };

      registry.register("error-test", reg);
      await expect(registry.execute("error-test", {}, ctx)).rejects.toThrow("not here");
    });
  });

  describe("getToolDefinitions", () => {
    it("returns empty array when no registrations", () => {
      expect(registry.getToolDefinitions()).toEqual([]);
    });

    it("returns tool defs from all registrations", () => {
      const handler: CommandHandler = async () => null;

      registry.register("cmd1", {
        handler,
        toolDef: { name: "tool1", description: "Tool 1", inputSchema: {} },
      });
      registry.register("cmd2", {
        handler,
        toolDef: { name: "tool2", description: "Tool 2", inputSchema: {} },
      });
      registry.register("cmd3", {
        handler,
        toolDef: { name: "tool3", description: "Tool 3", inputSchema: {} },
      });

      const defs = registry.getToolDefinitions();
      expect(defs).toHaveLength(3);
      expect(defs.map((d) => d.name)).toEqual(["tool1", "tool2", "tool3"]);
    });
  });

  describe("getToolNames", () => {
    it("returns all registered tool names", () => {
      const handler: CommandHandler = async () => null;
      registry.register("a", { handler, toolDef: { name: "a", description: "", inputSchema: {} } });
      registry.register("b", { handler, toolDef: { name: "b", description: "", inputSchema: {} } });

      expect(registry.getToolNames()).toEqual(["a", "b"]);
    });
  });
});

describe("createRegistry", () => {
  it("registers all expected MCP tools", async () => {
    const { createRegistry } = await import("./registry.js");
    const registry = createRegistry();
    const names = registry.getToolNames();

    const expectedTools = [
      "vault_read",
      "vault_write",
      "vault_search",
      "vault_project_context",
      "vault_init",
      "vault_decide",
      "vault_task",
      "vault_learn",
      "vault_todo",
      "vault_brainstorm",
      "vault_session",
      "vault_prune",
      "vault_stats",
      "vault_resume",
      "vault_deprecate",
    ];

    for (const name of expectedTools) {
      expect(names, `Missing tool: ${name}`).toContain(name);
    }
  });

  it("provides inputSchema with required fields for each tool", async () => {
    const { createRegistry } = await import("./registry.js");
    const registry = createRegistry();
    const defs = registry.getToolDefinitions();

    for (const def of defs) {
      expect(def.inputSchema, `${def.name}: missing inputSchema`).toBeDefined();
      expect(def.inputSchema, `${def.name}: inputSchema must be object`).toHaveProperty("type", "object");
    }
  });

  it("adaptArgs for vault_read passes path and coerces depth", async () => {
    const { createRegistry } = await import("./registry.js");
    const registry = createRegistry();
    const vaultFs = createMockVaultFs("# Hello");
    const ctx: CommandContext = { ...createMockContext(), vaultFs };

    const result = await registry.execute("vault_read", { path: "test.md", depth: "2" }, ctx);
    expect(result).toBe("# Hello");
    expect(vaultFs.read).toHaveBeenCalledWith("test.md");
  });

  it("adaptArgs directly transforms snake_case for each tool", async () => {
    const { createRegistry } = await import("./registry.js");
    const registry = createRegistry();

    const readReg = registry.get("vault_read");
    const readArgs = readReg!.adaptArgs!({ path: "f.md", depth: 3 });
    expect(readArgs).toEqual({ path: "f.md", depth: 3 });

    const taskReg = registry.get("vault_task");
    const taskArgs = taskReg!.adaptArgs!({ action: "add", title: "T", blocked_by: ["x"], assigned_to: "a" });
    expect(taskArgs).toEqual({ action: "add", title: "T", blockedBy: ["x"], assignedTo: "a" });

    const sessionReg = registry.get("vault_session");
    const sessionArgs = sessionReg!.adaptArgs!({ action: "register", tool: "t", task_summary: "s", files_touched: ["a.ts"] });
    expect(sessionArgs).toEqual({ action: "register", tool: "t", taskSummary: "s", filesTouched: ["a.ts"] });

    const learnReg = registry.get("vault_learn");
    const learnArgs = learnReg!.adaptArgs!({ action: "add", title: "L", tags: ["b"], session_id: "s1" });
    expect(learnArgs).toEqual({ action: "add", title: "L", tags: ["b"], sessionId: "s1" });

    const pruneReg = registry.get("vault_prune");
    const pruneArgs = pruneReg!.adaptArgs!({ mode: "dry-run", sessions_days: 30, done_tasks_days: 60 });
    expect(pruneArgs).toEqual({ mode: "dry-run", policy: { sessions: 30, doneTasks: 60 }, all: false });

    const ctxReg = registry.get("vault_project_context");
    const ctxArgs = ctxReg!.adaptArgs!({ project: "p", detail_level: "full" });
    expect(ctxArgs).toEqual({ project: "p", detailLevel: "full" });

    const writeReg = registry.get("vault_write");
    const writeArgs = writeReg!.adaptArgs!({ path: "f.md", content: "c", mode: "append" });
    expect(writeArgs).toEqual({ path: "f.md", content: "c", mode: "append" });

    const resumeReg = registry.get("vault_resume");
    const resumeArgs = resumeReg!.adaptArgs!({ project: "p", limit: 3, format: "json" });
    expect(resumeArgs).toEqual({ project: "p", limit: 3 });

    const searchReg = registry.get("vault_search");
    const searchArgs = searchReg!.adaptArgs!({ query: "q", limit: 5, project: "p", path_filter: "dir" });
    expect(searchArgs).toEqual({ query: "q", project: "p", limit: 5, structured: false });
  });
});
