import { describe, it, expect, afterEach } from "vitest";
import { createTestVault, createCommandContext, createTestContext } from "./test-helpers.js";
import { VaultFS } from "./lib/vault-fs.js";

describe("createTestVault", () => {
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    if (cleanup) await cleanup();
  });

  it("creates a vault directory and VaultFS instance", async () => {
    const { vaultRoot, vaultFs, cleanup: c } = await createTestVault();
    cleanup = c;

    expect(vaultRoot).toBeDefined();
    expect(vaultFs).toBeInstanceOf(VaultFS);
    expect(vaultFs.root).toBe(vaultRoot);
  });

  it("sets up project structure when setupProject is true", async () => {
    const { vaultRoot, vaultFs, cleanup: c } = await createTestVault({ setupProject: true });
    cleanup = c;

    const projectMap = JSON.parse(await vaultFs.read("project-map.json"));
    expect(projectMap.projects["test-project"]).toBe("/tmp/test");

    const content = await vaultFs.read("projects/test-project/context.md").catch(() => null);
    expect(content).toBeNull();
  });

  it("sets up custom project when project option is provided", async () => {
    const { vaultFs, cleanup: c } = await createTestVault({ project: "my-app" });
    cleanup = c;

    const projectMap = JSON.parse(await vaultFs.read("project-map.json"));
    expect(projectMap.projects["my-app"]).toBe("/tmp/test");
  });

  it("cleanup removes the vault directory", async () => {
    const { vaultRoot, vaultFs, cleanup: c } = await createTestVault();
    await c;

    await expect(vaultFs.read("project-map.json")).rejects.toThrow();
  });
});

describe("createCommandContext", () => {
  it("creates a context with all required fields", async () => {
    const { vaultFs, cleanup } = await createTestVault();

    try {
      const ctx = createCommandContext(vaultFs);

      expect(ctx.vaultFs).toBe(vaultFs);
      expect(ctx.vaultPath).toBe(vaultFs.root);
      expect(ctx.config.vaultPath).toBe(vaultFs.root);
      expect(ctx.log.debug).toBeDefined();
      expect(ctx.log.info).toBeDefined();
      expect(ctx.log.warn).toBeDefined();
      expect(ctx.log.error).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("allows overriding context fields", async () => {
    const { vaultFs, cleanup } = await createTestVault();

    try {
      const customLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
      const ctx = createCommandContext(vaultFs, { log: customLog as any });

      expect(ctx.log).toBe(customLog);
    } finally {
      await cleanup();
    }
  });
});

describe("createTestContext", () => {
  it("combines createTestVault and createCommandContext", async () => {
    const { vaultRoot, vaultFs, ctx, cleanup } = await createTestContext();

    try {
      expect(vaultRoot).toBeDefined();
      expect(vaultFs).toBeInstanceOf(VaultFS);
      expect(ctx.vaultFs).toBe(vaultFs);
      expect(ctx.vaultPath).toBe(vaultRoot);
    } finally {
      await cleanup();
    }
  });

  it("passes project option through", async () => {
    const { vaultFs, cleanup } = await createTestContext({ project: "custom" });

    try {
      const projectMap = JSON.parse(await vaultFs.read("project-map.json"));
      expect(projectMap.projects["custom"]).toBe("/tmp/test");
    } finally {
      await cleanup();
    }
  });
});
