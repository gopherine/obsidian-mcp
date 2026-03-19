import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { describe, test, expect, afterEach } from "vitest";
import { createTestVault, runCli } from "./helpers.js";

const PROJECT = "test-project";

async function setupVault() {
  const { vaultRoot, cleanup } = await createTestVault({ project: PROJECT });
  const slug = PROJECT;
  await mkdir(join(vaultRoot, `projects/${slug}/decisions`), { recursive: true });
  await mkdir(join(vaultRoot, `projects/${slug}/tasks`), { recursive: true });
  await mkdir(join(vaultRoot, `projects/${slug}/learnings`), { recursive: true });
  await mkdir(join(vaultRoot, `projects/${slug}/sessions`), { recursive: true });
  await mkdir(join(vaultRoot, `projects/${slug}/brainstorms`), { recursive: true });
  return { vaultRoot, cleanup, slug };
}

function env(vaultRoot: string) {
  return { VAULT_PATH: vaultRoot };
}

describe("CLI E2E: read + list", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("read outputs file content to stdout", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "hello.md"), "# Hello\nWorld");
    const r = await runCli(["read", "hello.md"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# Hello");
    expect(r.stdout).toContain("World");
  });

  test("read missing file exits with error", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(["read", "nonexistent.md"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Error");
  });

  test("list outputs entries line by line", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "a.md"), "a");
    await writeFile(join(vaultRoot, "b.md"), "b");
    const r = await runCli(["list", "."], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("a.md");
    expect(r.stdout).toContain("b.md");
  });

  test("list with --depth 2 shows nested entries", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, `projects/${PROJECT}/context.md`), "# Context");
    const r = await runCli(["list", ".", "--depth", "3"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("context.md");
  });
});

describe("CLI E2E: write + append", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("write with -c creates a file and outputs JSON result", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["write", "test-note.md", "-c", "# Test\nContent here"],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.path).toBe("test-note.md");
  });

  test("write with --mode append appends to existing file", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "existing.md"), "line1\n");
    const r = await runCli(
      ["write", "existing.md", "-c", "line2", "--mode", "append"],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.path).toBe("existing.md");
    const read = await runCli(["read", "existing.md"], { env: env(vaultRoot) });
    expect(read.stdout).toContain("line1");
    expect(read.stdout).toContain("line2");
  });

  test("append command appends to existing file", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "ap.md"), "first\n");
    const r = await runCli(
      ["append", "ap.md", "-c", "second"],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.path).toBe("ap.md");
    const read = await runCli(["read", "ap.md"], { env: env(vaultRoot) });
    expect(read.stdout).toContain("first");
    expect(read.stdout).toContain("second");
  });

  test("write with --frontmatter creates file with YAML frontmatter", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const fm = JSON.stringify({ type: "adr", status: "active" });
    const r = await runCli(
      ["write", "with-fm.md", "-c", "# ADR", "--frontmatter", fm],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const read = await runCli(["read", "with-fm.md"], { env: env(vaultRoot) });
    expect(read.stdout).toContain("---");
    expect(read.stdout).toContain("type: adr");
    expect(read.stdout).toContain("status: active");
  });
});

describe("CLI E2E: search", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("search finds matching files", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "findme.md"), "# Findme\nThis has unicorn data");
    await writeFile(join(vaultRoot, "other.md"), "# Other\nNothing to see");
    const r = await runCli(["search", "unicorn"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(0);
    const results = JSON.parse(r.stdout);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((item: any) => item.path === "findme.md" || item.path.includes("findme"))).toBe(true);
  });

  test("search with --project filters by project", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(
      join(vaultRoot, `projects/${PROJECT}/notes.md`),
      "# Project Note\nUnique project keyword xyzzy"
    );
    await writeFile(join(vaultRoot, "root-note.md"), "# Root Note\nxyzzy");
    const r = await runCli(
      ["search", "xyzzy", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const results = JSON.parse(r.stdout);
    const allMatch = results.every((item: any) =>
      item.path.includes(`projects/${PROJECT}`)
    );
    expect(allMatch).toBe(true);
  });
});

describe("CLI E2E: project artifacts", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("decide creates an ADR and outputs JSON with path", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      [
        "decide",
        "--title", "Use TypeScript",
        "--decision", "We will use TypeScript",
        "--project", PROJECT,
      ],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.path).toContain("decisions");
    expect(result.path).toMatch(/\.md$/);
  });

  test("task add creates a task", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["task", "add", "Build auth module", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.task_id).toBeDefined();
    expect(result.path).toContain("tasks");
  });

  test("task list lists tasks as JSON-like output", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await runCli(
      ["task", "add", "First task", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    const r = await runCli(
      ["task", "list", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("First task");
  });

  test("learn add creates a learning", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      [
        "learn", "add",
        "--title", "TypeScript strict mode catches bugs",
        "--discovery", "Strict mode caught a null reference at compile time",
        "--project", PROJECT,
      ],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.learning_id).toBeDefined();
    expect(result.path).toContain("learnings");
  });
});

describe("CLI E2E: context + resume", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("context outputs project context", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(
      join(vaultRoot, `projects/${PROJECT}/context.md`),
      "# Test Project\n## Stack\n- TypeScript\n## Commands\n- build"
    );
    const r = await runCli(
      ["context", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Test Project");
  });

  test("context --detail full returns untruncated context", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const longContent = "# Project\n" + "## Section\nThis is padding text to increase the token count well beyond the default summary budget of 1500 tokens. ".repeat(100);
    await writeFile(
      join(vaultRoot, `projects/${PROJECT}/context.md`),
      longContent
    );
    const rFull = await runCli(
      ["context", "--project", PROJECT, "--detail", "full"],
      { env: env(vaultRoot) }
    );
    expect(rFull.exitCode).toBe(0);
    expect(rFull.stdout).toContain("Project");
    const rSummary = await runCli(
      ["context", "--project", PROJECT, "--detail", "summary"],
      { env: env(vaultRoot) }
    );
    expect(rSummary.exitCode).toBe(0);
    expect(rFull.stdout.length).toBeGreaterThan(rSummary.stdout.length);
  });

  test("resume outputs session resume context", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["resume", "--project", PROJECT, "--json"],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.project).toBe(PROJECT);
    expect(result.suggested_next_steps).toBeDefined();
  });
});

describe("CLI E2E: todo", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("todo list shows empty todos", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["todo", "list", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
  });

  test("todo add adds a todo", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["todo", "add", "Buy milk", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Added: Buy milk");
    const list = await runCli(
      ["todo", "list", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(list.stdout).toContain("Buy milk");
  });

  test("todo complete completes a todo", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await runCli(
      ["todo", "add", "Read book", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    const r = await runCli(
      ["todo", "complete", "Read book", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Completed: Read book");
  });
});

describe("CLI E2E: stats + deprecate", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("stats outputs project statistics", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(
      ["stats", "--project", PROJECT],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(PROJECT);
    expect(r.stdout).toContain("Sessions:");
    expect(r.stdout).toContain("Tasks:");
  });

  test("deprecate marks a file as deprecated", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    await writeFile(join(vaultRoot, "old-note.md"), "# Old Note\nDeprecated content");
    const r = await runCli(
      ["deprecate", "old-note.md", "--reason", "Replaced by new-note.md"],
      { env: env(vaultRoot) }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Deprecated");
    expect(r.stdout).toContain("old-note.md");
    const read = await runCli(["read", "old-note.md"], { env: env(vaultRoot) });
    expect(read.stdout).toContain("deprecated");
  });
});

describe("CLI E2E: error handling", () => {
  let vaultRoot: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  test("invalid command exits with error", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(["nonexistent-command"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(1);
  });

  test("missing required option shows error", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(["write", "note.md"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("required");
  });

  test("--help outputs usage info and exits 0", async () => {
    ({ vaultRoot, cleanup } = await setupVault());
    const r = await runCli(["--help"], { env: env(vaultRoot) });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("obsidian-mcp");
  });
});
