import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { contextCommand } from "./context.js";
import { VaultFS } from "../lib/vault-fs.js";
import type { CommandContext } from "../core/types.js";

function createCommandContext(vaultFs: VaultFS, overrides?: Partial<CommandContext>): CommandContext {
  return {
    vaultFs,
    vaultPath: vaultFs.root,
    sessionRegistry: {} as any,
    config: {} as any,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("contextCommand", () => {
  let vaultRoot: string;
  let vaultFs: VaultFS;
  let ctx: CommandContext;

  beforeEach(async () => {
    vaultRoot = join(homedir(), `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(vaultRoot, { recursive: true });
    vaultFs = new VaultFS(vaultRoot);
    ctx = createCommandContext(vaultFs);
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  describe("missing context file", () => {
    it("returns message when context file does not exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.project_slug).toBe("test-project");
      expect(result.context_md).toContain("No context file found");
      expect(result.token_estimate).toBe(20);
      expect(result.sections).toEqual([]);
      expect(result.truncated).toBe(false);
    });
  });

  describe("summary mode (default)", () => {
    it("returns context content with truncation if over budget", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      const longContent = "a".repeat(10000);
      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
project: test-project
---

# Project Context

## Overview

${longContent}

## Details

More content here.
`
      );

      const result = await contextCommand({
        project: "test-project",
        maxTokens: 100,
      }, ctx);

      expect(result.truncated).toBe(true);
      expect(result.token_estimate).toBeLessThan(100);
    });

    it("extracts section headings", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
project: test-project
---

# Project Context

## Overview

Overview content.

## Tech Stack

Stack details.

## Architecture

Arch details.
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.sections).toContain("Overview");
      expect(result.sections).toContain("Tech Stack");
      expect(result.sections).toContain("Architecture");
    });
  });

  describe("full mode", () => {
    it("returns full context without truncation", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      const longContent = "a".repeat(10000);
      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Project Context

${longContent}
`
      );

      const result = await contextCommand({
        project: "test-project",
        detailLevel: "full",
      }, ctx);

      expect(result.truncated).toBe(false);
      expect(result.context_md).toContain(longContent);
      expect(result.token_estimate).toBeGreaterThan(2000);
    });
  });

  describe("learning count", () => {
    it("counts learning files", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/learnings"), { recursive: true });
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Context
`
      );

      await vaultFs.write(
        `projects/test-project/learnings/001-test.md`,
        `---
type: learning
---

# Learning 1
`
      );

      await vaultFs.write(
        `projects/test-project/learnings/002-test.md`,
        `---
type: learning
---

# Learning 2
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.learning_count).toBe(2);
    });

    it("returns 0 when learnings directory does not exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Context
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.learning_count).toBe(0);
    });
  });

  describe("last session", () => {
    it("extracts last session info", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Context
`
      );

      await vaultFs.write(
        `projects/test-project/sessions/2024-01-15-session-abc123.md`,
        `---
type: session
outcome: Implemented feature X
completed_at: "2024-01-15T10:30:00Z"
---

# Session
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_session).not.toBeNull();
      expect(result.last_session!.outcome).toBe("Implemented feature X");
      expect(result.last_session!.completed_at).toBe("2024-01-15T10:30:00Z");
    });

    it("returns null when no sessions exist", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Context
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_session).toBeNull();
    });

    it("falls back to created date if completed_at missing", async () => {
      await vaultFs.write("project-map.json", JSON.stringify({ projects: { "test-project": "/tmp/test" } }));
      await mkdir(join(vaultRoot, "projects/test-project/sessions"), { recursive: true });
      await mkdir(join(vaultRoot, "projects/test-project"), { recursive: true });

      await vaultFs.write(
        `projects/test-project/context.md`,
        `---
type: context
---

# Context
`
      );

      await vaultFs.write(
        `projects/test-project/sessions/2024-01-15-session-abc.md`,
        `---
type: session
outcome: Test session
created: "2024-01-15"
---

# Session
`
      );

      const result = await contextCommand({
        project: "test-project",
      }, ctx);

      expect(result.last_session!.completed_at).toBe("2024-01-15");
    });
  });
});
