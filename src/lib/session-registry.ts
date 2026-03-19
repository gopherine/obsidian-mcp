import { readFile, writeFile, mkdir, unlink, stat, open } from "fs/promises";
import { resolve, dirname } from "path";
import { randomBytes } from "crypto";

export interface Session {
  id: string;
  tool: string;
  project: string | null;
  task_summary: string | null;
  files_touched: string[];
  started_at: string;
  last_heartbeat: string;
  completed_at: string | null;
  status: "active" | "stale" | "completed";
}

export interface SessionRegistry {
  sessions: Session[];
}

interface Conflict {
  session_id: string;
  tool: string;
  overlapping_files: string[];
  task_summary: string | null;
}

/**
 * Manages the session registry for multi-agent coordination.
 * Uses PID lockfiles for safe concurrent access.
 */
export class SessionRegistryManager {
  private readonly registryPath: string;
  private readonly locksDir: string;

  constructor(vaultPath: string, private readonly ttlHours: number) {
    this.registryPath = resolve(vaultPath, "coordination/session-registry.json");
    this.locksDir = resolve(vaultPath, "coordination/locks");
  }

  /**
   * Register a new session. Returns session ID and any conflicts.
   */
  async register(
    tool: string,
    project: string | null,
    taskSummary: string | null = null,
    filesTouched: string[] = []
  ): Promise<{ session_id: string; conflicts: Conflict[] }> {
    const sessionId = `${tool}-${randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();

    const session: Session = {
      id: sessionId,
      tool,
      project,
      task_summary: taskSummary,
      files_touched: filesTouched,
      started_at: now,
      last_heartbeat: now,
      completed_at: null,
      status: "active",
    };

    return await this.withLock(async () => {
      const registry = await this.readRegistry();
      this.cleanStale(registry);
      this.cleanOldCompleted(registry);

      // Detect conflicts (use Set for O(n+m) intersection)
      const conflicts: Conflict[] = [];
      if (filesTouched.length > 0) {
        const touchedSet = new Set(filesTouched);
        for (const existing of registry.sessions) {
          if (existing.status !== "active") continue;
          const overlap = existing.files_touched.filter((f) => touchedSet.has(f));
          if (overlap.length > 0) {
            conflicts.push({
              session_id: existing.id,
              tool: existing.tool,
              overlapping_files: overlap,
              task_summary: existing.task_summary,
            });
          }
        }
      }

      registry.sessions.push(session);
      await this.writeRegistry(registry);

      return { session_id: sessionId, conflicts };
    });
  }

  /**
   * Update heartbeat for a session. Returns false if session not found.
   */
  async heartbeat(sessionId: string): Promise<boolean> {
    return await this.withLock(async () => {
      const registry = await this.readRegistry();
      const session = registry.sessions.find((s) => s.id === sessionId);
      if (!session) return false;
      session.last_heartbeat = new Date().toISOString();
      await this.writeRegistry(registry);
      return true;
    });
  }

  /**
   * Mark a session as completed.
   */
  async complete(sessionId: string, summary?: string): Promise<void> {
    await this.withLock(async () => {
      const registry = await this.readRegistry();
      const session = registry.sessions.find((s) => s.id === sessionId);
      if (session) {
        session.status = "completed";
        session.completed_at = new Date().toISOString();
        if (summary) session.task_summary = summary;
      }
      this.cleanOldCompleted(registry);
      await this.writeRegistry(registry);
    });
  }

  /**
   * List active sessions. Persists stale status changes.
   */
  async listActive(): Promise<Session[]> {
    return await this.withLock(async () => {
      const registry = await this.readRegistry();
      const hadStale = this.cleanStale(registry);
      if (hadStale) {
        await this.writeRegistry(registry);
      }
      return registry.sessions.filter((s) => s.status === "active");
    });
  }

  private cleanOldCompleted(registry: SessionRegistry): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    registry.sessions = registry.sessions.filter((s) => {
      if (s.status !== "completed") return true;
      const ts = s.completed_at ?? s.started_at;
      if (typeof ts !== "string") return false;
      const time = new Date(ts).getTime();
      return !isNaN(time) && time > cutoff;
    });
  }

  private cleanStale(registry: SessionRegistry): boolean {
    let changed = false;
    const cutoff = Date.now() - this.ttlHours * 60 * 60 * 1000;
    for (const session of registry.sessions) {
      if (
        session.status === "active" &&
        new Date(session.last_heartbeat).getTime() < cutoff
      ) {
        session.status = "stale";
        changed = true;
      }
    }
    return changed;
  }

  private async readRegistry(): Promise<SessionRegistry> {
    try {
      const raw = await readFile(this.registryPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Schema validation: ensure sessions is an array of valid objects
      if (!parsed || !Array.isArray(parsed.sessions)) {
        return { sessions: [] };
      }

      // Filter out malformed entries
      const validSessions = parsed.sessions.filter(
        (s: any): s is Session =>
          typeof s === "object" &&
          s !== null &&
          typeof s.id === "string" &&
          typeof s.tool === "string" &&
          typeof s.status === "string" &&
          typeof s.started_at === "string" &&
          typeof s.last_heartbeat === "string" &&
          !isNaN(new Date(s.last_heartbeat).getTime()) &&
          Array.isArray(s.files_touched)
      );

      return { sessions: validSessions };
    } catch (e: any) {
      if (e?.code !== "ENOENT") {
        console.error("[session-registry] Error reading registry:", e.message);
      }
      return { sessions: [] };
    }
  }

  private async writeRegistry(registry: SessionRegistry): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true });
    await writeFile(this.registryPath, JSON.stringify(registry, null, 2), "utf-8");
  }

  /**
   * PID-based lockfile for safe concurrent writes.
   * Times out after 2 seconds with retry.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = resolve(this.locksDir, "session-registry.lock");
    await mkdir(this.locksDir, { recursive: true });

    const maxRetries = 8;
    const retryDelay = 100;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const lockContent = JSON.stringify({
          pid: process.pid,
          tool: "obsidian-mcp",
          timestamp: new Date().toISOString(),
        });

        const fd = await open(lockPath, "wx");
        try {
          await fd.write(Buffer.from(lockContent, "utf-8"));
        } finally {
          await fd.close();
        }

        // Lock acquired — run the function
        try {
          return await fn();
        } finally {
          await unlink(lockPath).catch(() => {});
        }
      } catch (e: any) {
        if (e.code === "EEXIST") {
          // Lock exists — check if it's stale
          try {
            const lockStat = await stat(lockPath);
            const lockAge = Date.now() - lockStat.mtimeMs;
            if (lockAge > 5000) {
              // Lock is stale (>5s), force remove
              await unlink(lockPath).catch(() => {});
              continue;
            }

            // Lock is fresh — check if PID is alive
            const lockData = JSON.parse(await readFile(lockPath, "utf-8"));
            try {
              process.kill(lockData.pid, 0);
              // PID is alive — wait and retry
            } catch {
              // PID is dead — remove stale lock
              await unlink(lockPath).catch(() => {});
              continue;
            }
          } catch {
            // Can't read lock — try to remove it
            await unlink(lockPath).catch(() => {});
            continue;
          }

          // Wait before retrying
          await new Promise((r) => setTimeout(r, retryDelay));
        } else {
          throw e;
        }
      }
    }

    throw new Error("Failed to acquire lock after retries");
  }
}
