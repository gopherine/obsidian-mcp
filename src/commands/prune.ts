// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CommandContext } from "../core/types.js";
import { VaultFS } from "../lib/vault-fs.js";
import { parseFrontmatter, mergeFrontmatter, serializeFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";

export interface RetentionPolicy {
  sessions: number;
  doneTasks: number;
  learnings: number;
  brainstorms: number;
  adrs: number;
  todos: number;
}

const DEFAULT_POLICY: RetentionPolicy = {
  sessions: 30,
  doneTasks: 30,
  learnings: 0,
  brainstorms: 0,
  adrs: 0,
  todos: 0,
};

export interface PruneResult {
  project: string;
  archived: { from: string; to: string }[];
  deleted: string[];
  deprecated: string[];
  stats: {
    sessions_scanned: number;
    tasks_scanned: number;
    learnings_scanned: number;
    total_archived: number;
    total_deleted: number;
    total_deprecated: number;
  };
}

export interface VaultStats {
  project: string;
  sessions: number;
  tasks: { total: number; backlog: number; inProgress: number; done: number; cancelled: number };
  learnings: number;
  adrs: number;
  brainstorms: number;
  totalFiles: number;
  oldestFile: string | null;
}

export async function pruneCommand(
  args: {
    project?: string;
    mode: "dry-run" | "archive" | "delete";
    policy?: Partial<RetentionPolicy>;
    all?: boolean;
  },
  ctx: CommandContext,
): Promise<PruneResult[]> {
  const policy = { ...DEFAULT_POLICY, ...args.policy };
  const results: PruneResult[] = [];
  const vaultFs = ctx.vaultFs;

  if (args.all) {
    const projectFiles = await vaultFs.list("projects", 1);
    const projectDirs = projectFiles
      .filter((f) => f.endsWith("/") && !f.endsWith("_index.md"))
      .map((f) => f.replace("projects/", "").replace("/", ""));

    for (const slug of projectDirs) {
      const result = await pruneProject(vaultFs, slug, args.mode, policy);
      results.push(result);
    }
  } else {
    const projectSlug = await resolveProject(ctx.vaultPath, args.project);
    const result = await pruneProject(vaultFs, projectSlug, args.mode, policy);
    results.push(result);
  }

  return results;
}

export async function statsCommand(
  args: { project?: string },
  ctx: CommandContext,
): Promise<VaultStats> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);
  const vaultFs = ctx.vaultFs;
  const base = `projects/${projectSlug}`;

  const sessionCount = await countFiles(vaultFs, `${base}/sessions`);
  const learningCount = await countFiles(vaultFs, `${base}/learnings`);
  const adrCount = await countFiles(vaultFs, `${base}/decisions`);
  const brainstormCount = await countFiles(vaultFs, `${base}/brainstorms`);

  const taskBreakdown = { total: 0, backlog: 0, inProgress: 0, done: 0, cancelled: 0 };
  try {
    const taskFiles = await vaultFs.list(`${base}/tasks`, 1);
    for (const f of taskFiles) {
      if (!f.endsWith(".md")) continue;
      taskBreakdown.total++;
      try {
        const content = await vaultFs.read(f);
        const { data } = parseFrontmatter(content);
        switch (data.status) {
          case "backlog": taskBreakdown.backlog++; break;
          case "in-progress": taskBreakdown.inProgress++; break;
          case "done": taskBreakdown.done++; break;
          case "cancelled": taskBreakdown.cancelled++; break;
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* no tasks dir */ }

  const totalFiles = sessionCount + learningCount + adrCount + brainstormCount + taskBreakdown.total;

  return {
    project: projectSlug,
    sessions: sessionCount,
    tasks: taskBreakdown,
    learnings: learningCount,
    adrs: adrCount,
    brainstorms: brainstormCount,
    totalFiles,
    oldestFile: null,
  };
}

export async function deprecateCommand(
  args: {
    path: string;
    reason?: string;
  },
  ctx: CommandContext,
): Promise<{ path: string; status: string }> {
  const content = await ctx.vaultFs.read(args.path);
  const { data, content: body } = parseFrontmatter(content);

  const updatedFm = mergeFrontmatter(data, { status: "deprecated" });
  let updatedBody = body;

  if (args.reason) {
    updatedBody = body.trimEnd() + `\n\n---\n**Deprecated**: ${args.reason} (${new Date().toISOString().slice(0, 10)})\n`;
  }

  await ctx.vaultFs.write(args.path, serializeFrontmatter(updatedFm, updatedBody));
  return { path: args.path, status: "deprecated" };
}

async function pruneProject(
  vaultFs: VaultFS,
  projectSlug: string,
  mode: "dry-run" | "archive" | "delete",
  policy: RetentionPolicy
): Promise<PruneResult> {
  const result: PruneResult = {
    project: projectSlug,
    archived: [],
    deleted: [],
    deprecated: [],
    stats: {
      sessions_scanned: 0,
      tasks_scanned: 0,
      learnings_scanned: 0,
      total_archived: 0,
      total_deleted: 0,
      total_deprecated: 0,
    },
  };

  const base = `projects/${projectSlug}`;
  const archiveBase = `projects/${projectSlug}/_archive`;

  if (policy.sessions > 0) {
    await pruneByAge(vaultFs, `${base}/sessions`, `${archiveBase}/sessions`, policy.sessions, mode, result);
  }

  if (policy.doneTasks > 0) {
    await pruneByStatus(vaultFs, `${base}/tasks`, `${archiveBase}/tasks`, ["done", "cancelled"], policy.doneTasks, mode, result, "tasks_scanned");
  }

  if (policy.todos > 0) {
    await pruneTodos(vaultFs, `${base}/todos.md`, policy.todos, mode, result);
  }

  result.stats.total_archived = result.archived.length;
  result.stats.total_deleted = result.deleted.length;
  result.stats.total_deprecated = result.deprecated.length;

  return result;
}

async function pruneByAge(
  vaultFs: VaultFS,
  dir: string,
  archiveDir: string,
  maxAgeDays: number,
  mode: "dry-run" | "archive" | "delete",
  result: PruneResult
): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let files: string[];
  try {
    files = await vaultFs.list(dir, 1);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    result.stats.sessions_scanned++;

    try {
      const content = await vaultFs.read(file);
      const { data } = parseFrontmatter(content);

      const dateStr = (data.completed_at ?? data.updated ?? data.created) as string | undefined;
      if (!dateStr) continue;

      const fileTime = new Date(dateStr).getTime();
      if (isNaN(fileTime) || fileTime > cutoff) continue;

      if (mode === "dry-run") {
        result.archived.push({ from: file, to: file.replace(dir, archiveDir) });
      } else if (mode === "archive") {
        const archivePath = file.replace(dir, archiveDir);
        await vaultFs.move(file, archivePath);
        result.archived.push({ from: file, to: archivePath });
      } else {
        await vaultFs.delete(file);
        result.deleted.push(file);
      }
    } catch (e: unknown) {
      if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
        console.error(`[prune] Skipping unreadable session file: ${file}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}

async function pruneByStatus(
  vaultFs: VaultFS,
  dir: string,
  archiveDir: string,
  statuses: string[],
  maxAgeDays: number,
  mode: "dry-run" | "archive" | "delete",
  result: PruneResult,
  scanCounter: keyof PruneResult["stats"]
): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let files: string[];
  try {
    files = await vaultFs.list(dir, 1);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    (result.stats[scanCounter] as number)++;

    try {
      const content = await vaultFs.read(file);
      const { data } = parseFrontmatter(content);

      if (!statuses.includes(data.status as string)) continue;

      const dateStr = (data.updated ?? data.created) as string | undefined;
      if (!dateStr) continue;

      const fileTime = new Date(dateStr).getTime();
      if (isNaN(fileTime) || fileTime > cutoff) continue;

      if (mode === "dry-run") {
        result.archived.push({ from: file, to: file.replace(dir, archiveDir) });
      } else if (mode === "archive") {
        const archivePath = file.replace(dir, archiveDir);
        await vaultFs.move(file, archivePath);
        result.archived.push({ from: file, to: archivePath });
      } else {
        await vaultFs.delete(file);
        result.deleted.push(file);
      }
    } catch (e: unknown) {
      if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
        console.error(`[prune] Skipping unreadable task file: ${file}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}

async function pruneTodos(
  vaultFs: VaultFS,
  todoPath: string,
  _maxAgeDays: number,
  mode: "dry-run" | "archive" | "delete",
  result: PruneResult
): Promise<void> {
  try {
    const content = await vaultFs.read(todoPath);
    const { data, content: body } = parseFrontmatter(content);

    const lines = body.split("\n");
    const completedLines = lines.filter((l) => l.match(/^- \[x\]/));

    if (completedLines.length === 0) return;

    if (mode === "dry-run") {
      for (const line of completedLines) {
        result.deleted.push(`${todoPath}: ${line.trim()}`);
      }
    } else {
      const prunedLines = lines.filter((l) => !l.match(/^- \[x\]/));
      const updated = mergeFrontmatter(data, {});
      await vaultFs.write(todoPath, serializeFrontmatter(updated, prunedLines.join("\n")));
      for (const line of completedLines) {
        result.deleted.push(`${todoPath}: ${line.trim()}`);
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
      console.error(`[prune] Error reading todos file:`, e instanceof Error ? e.message : e);
    }
  }
}

async function countFiles(vaultFs: VaultFS, dir: string): Promise<number> {
  try {
    const files = await vaultFs.list(dir, 1);
    return files.filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}
