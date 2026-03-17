import { SessionRegistryManager, type Session } from "../lib/session-registry.js";
import { VaultFS } from "../lib/vault-fs.js";
import { serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";

export async function sessionCommand(
  registry: SessionRegistryManager,
  options: {
    action: "register" | "heartbeat" | "complete" | "list_active";
    tool?: string;
    project?: string;
    taskSummary?: string;
    filesTouched?: string[];
    sessionId?: string;
    outcome?: string;
    tasksCompleted?: string[];
  },
  vaultFs?: VaultFS,
): Promise<{
  session_id?: string;
  active_sessions?: Session[];
  conflicts?: Array<{
    session_id: string;
    tool: string;
    overlapping_files: string[];
    task_summary: string | null;
  }>;
  session_note_path?: string;
}> {
  switch (options.action) {
    case "register": {
      if (!options.tool) throw new Error("Tool name required for register");
      const result = await registry.register(
        options.tool,
        options.project ?? null,
        options.taskSummary ?? null,
        options.filesTouched ?? []
      );
      return {
        session_id: result.session_id,
        conflicts: result.conflicts,
      };
    }

    case "heartbeat": {
      if (!options.sessionId) throw new Error("Session ID required for heartbeat");
      await registry.heartbeat(options.sessionId);
      return {};
    }

    case "complete": {
      if (!options.sessionId) throw new Error("Session ID required for complete");
      await registry.complete(options.sessionId, options.taskSummary);

      // Persist session note if we have a vault and project
      let sessionNotePath: string | undefined;
      if (vaultFs && options.project) {
        sessionNotePath = await persistSessionNote(vaultFs, {
          sessionId: options.sessionId,
          project: options.project,
          tool: options.tool ?? extractToolFromId(options.sessionId),
          outcome: options.outcome ?? options.taskSummary ?? "",
          filesTouched: options.filesTouched ?? [],
          tasksCompleted: options.tasksCompleted ?? [],
          startedAt: new Date().toISOString(), // best effort — registry doesn't expose start time
        });
      }

      return { session_note_path: sessionNotePath };
    }

    case "list_active": {
      const sessions = await registry.listActive();
      return { active_sessions: sessions };
    }

    default:
      throw new Error(`Unknown action: ${options.action}`);
  }
}

function extractToolFromId(sessionId: string): string {
  // Session IDs are formatted as "<tool>-<hex>"
  const parts = sessionId.split("-");
  if (parts.length >= 2) {
    // Everything except the last part (hex) is the tool name
    return parts.slice(0, -1).join("-");
  }
  return "unknown";
}

async function persistSessionNote(
  vaultFs: VaultFS,
  opts: {
    sessionId: string;
    project: string;
    tool: string;
    outcome: string;
    filesTouched: string[];
    tasksCompleted: string[];
    startedAt: string;
  }
): Promise<string> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const completedAt = now.toISOString();
  const shortId = opts.sessionId.slice(-8);
  const toolSlug = opts.tool.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  const filename = `${today}-${toolSlug}-${shortId}.md`;
  const filePath = `projects/${opts.project}/sessions/${filename}`;

  const fm = createFrontmatter({
    type: "session",
    project: opts.project,
    tool: opts.tool,
    session_id: opts.sessionId,
    status: "completed",
    started_at: opts.startedAt,
    completed_at: completedAt,
    outcome: opts.outcome,
    files_touched: opts.filesTouched,
    tasks_completed: opts.tasksCompleted,
    learnings_captured: 0,
  });

  const body = `\n# Session: ${opts.outcome || "No outcome recorded"}\n\n**Tool**: ${opts.tool}\n**Session ID**: ${opts.sessionId}\n**Completed**: ${completedAt}\n`;

  await vaultFs.write(filePath, serializeFrontmatter(fm, body));
  return filePath;
}
