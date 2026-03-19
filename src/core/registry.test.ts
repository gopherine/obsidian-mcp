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
});
