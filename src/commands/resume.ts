import type { CommandContext } from "../core/types.js";
import { VaultFS } from "../lib/vault-fs.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { SessionRegistryManager, type Session } from "../lib/session-registry.js";

export interface ResumeContext {
  project: string;
  last_sessions: Array<{
    tool: string;
    outcome: string;
    completed_at: string;
    files_touched: string[];
    tasks_completed: string[];
  }>;
  active_sessions: Session[];
  interrupted_sessions: Session[];
  suggested_next_steps: string[];
}

export async function resumeCommand(
  args: {
    project?: string;
    limit?: number;
  },
  ctx: CommandContext,
): Promise<ResumeContext> {
  const vaultFs = ctx.vaultFs;
  const registry = ctx.sessionRegistry;
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);

  const limit = args.limit ?? 5;

  const lastSessions: ResumeContext["last_sessions"] = [];
  try {
    const sessionFiles = await vaultFs.list(`projects/${projectSlug}/sessions`, 1);
    const mdFiles = sessionFiles.filter((f) => f.endsWith(".md")).sort().reverse().slice(0, limit);

    for (const file of mdFiles) {
      try {
        const content = await vaultFs.read(file);
        const { data } = parseFrontmatter(content);
        lastSessions.push({
          tool: (data.tool as string) ?? "unknown",
          outcome: (data.outcome as string) ?? "",
          completed_at: (data.completed_at as string) ?? (data.created as string) ?? "",
          files_touched: Array.isArray(data.files_touched) ? data.files_touched as string[] : [],
          tasks_completed: Array.isArray(data.tasks_completed) ? data.tasks_completed as string[] : [],
        });
      } catch (e: unknown) {
        if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
          console.error("[resume] Skipping unreadable session file:", e instanceof Error ? e.message : e);
        }
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
      console.error("[resume] Error listing session files:", e instanceof Error ? e.message : e);
    }
  }

  const allSessions = await registry.listActive();
  const activeSessions = allSessions.filter((s) => s.project === projectSlug && s.status === "active");

  const interruptedSessions: Session[] = [];
  try {
    const regContent = await vaultFs.read("coordination/session-registry.json");
    const parsed = JSON.parse(regContent);
    if (Array.isArray(parsed.sessions)) {
      for (const s of parsed.sessions) {
        if (s.project === projectSlug && s.status === "stale") {
          interruptedSessions.push(s as Session);
        }
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
      console.error("[resume] Error reading session registry:", e instanceof Error ? e.message : e);
    }
  }

  const suggestedNextSteps: string[] = [];

  if (interruptedSessions.length > 0) {
    for (const s of interruptedSessions) {
      suggestedNextSteps.push(
        `Resume interrupted ${s.tool} session: "${s.task_summary ?? "unknown task"}" (started ${s.started_at})`
      );
    }
  }

  if (lastSessions.length > 0) {
    const latest = lastSessions[0];
    if (latest.outcome) {
      suggestedNextSteps.push(`Last session (${latest.tool}): ${latest.outcome}`);
    }
  }

  try {
    const taskFiles = await vaultFs.list(`projects/${projectSlug}/tasks`, 1);
    for (const file of taskFiles) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = await vaultFs.read(file);
        const { data, content: body } = parseFrontmatter(content);
        if (data.status === "in-progress") {
          const titleMatch = body.match(/^# (.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : file;
          suggestedNextSteps.push(`In-progress task: ${title}`);
        }
      } catch (e: unknown) {
        if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
          console.error("[resume] Skipping unreadable task file:", e instanceof Error ? e.message : e);
        }
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
      console.error("[resume] Error listing task files:", e instanceof Error ? e.message : e);
    }
  }

  return {
    project: projectSlug,
    last_sessions: lastSessions,
    active_sessions: activeSessions,
    interrupted_sessions: interruptedSessions,
    suggested_next_steps: suggestedNextSteps,
  };
}

export function formatResumeContext(ctx: ResumeContext): string {
  const lines: string[] = [];

  lines.push(`## Session Resume: ${ctx.project}`);
  lines.push("");

  if (ctx.interrupted_sessions.length > 0) {
    lines.push("### Interrupted Sessions (stale)");
    for (const s of ctx.interrupted_sessions) {
      lines.push(`- **${s.tool}**: ${s.task_summary ?? "unknown"} (started ${s.started_at})`);
      if (s.files_touched.length > 0) {
        lines.push(`  Files: ${s.files_touched.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (ctx.last_sessions.length > 0) {
    lines.push("### Recent Sessions");
    for (const s of ctx.last_sessions) {
      lines.push(`- **${s.tool}** (${s.completed_at}): ${s.outcome || "no outcome recorded"}`);
    }
    lines.push("");
  }

  if (ctx.suggested_next_steps.length > 0) {
    lines.push("### Suggested Next Steps");
    for (const step of ctx.suggested_next_steps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  if (ctx.active_sessions.length > 0) {
    lines.push("### Active Sessions (other agents)");
    for (const s of ctx.active_sessions) {
      lines.push(`- **${s.tool}**: ${s.task_summary ?? "unknown"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
