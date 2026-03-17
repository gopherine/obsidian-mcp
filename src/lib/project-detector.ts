import { readFile } from "fs/promises";
import { resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface ProjectMap {
  [cwdPath: string]: string;
}

interface CacheEntry {
  map: ProjectMap;
  time: number;
  vaultPath: string;
}

const CACHE_TTL_MS = 60_000; // 1 minute
let cache: CacheEntry | null = null;

/**
 * Load the project map from the vault. Cache is keyed by vaultPath.
 */
async function loadProjectMap(vaultPath: string): Promise<ProjectMap> {
  const now = Date.now();
  if (cache && cache.vaultPath === vaultPath && now - cache.time < CACHE_TTL_MS) {
    return cache.map;
  }

  const mapPath = resolve(vaultPath, "project-map.json");
  try {
    const raw = await readFile(mapPath, "utf-8");
    const parsed = JSON.parse(raw);
    // Validate: must be a plain object with string values
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const map: ProjectMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        map[key] = value;
      }
    }
    cache = { map, time: now, vaultPath };
    return map;
  } catch {
    return {};
  }
}

/**
 * Strip worktree suffixes from a path.
 */
function stripWorktreeSuffix(cwd: string): string {
  // Pattern: /path/to/project/.worktrees/feat-name
  const worktreeMatch = cwd.match(/^(.+?)\/\.worktrees\/[^/]+/);
  if (worktreeMatch) return worktreeMatch[1];

  // Pattern: /path/to/project/.claude/worktrees/feat/name
  const claudeWorktreeMatch = cwd.match(/^(.+?)\/\.claude\/worktrees\/.+/);
  if (claudeWorktreeMatch) return claudeWorktreeMatch[1];

  // Pattern: /path/to/project/.claude-worktrees/name
  const oldWorktreeMatch = cwd.match(/^(.+?)\/\.claude-worktrees\/[^/]+/);
  if (oldWorktreeMatch) return oldWorktreeMatch[1];

  return cwd;
}

/**
 * Try to detect git root of current directory (async, non-blocking).
 */
async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      timeout: 3000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Detect the project slug from a working directory.
 *
 * Strategy:
 * 1. Strip worktree suffixes from cwd
 * 2. Try exact match in project-map.json
 * 3. Try matching cwd as a subdirectory of a mapped path
 * 4. Try git root as a mapped path
 * 5. Return null if no match
 */
export async function detectProject(cwd: string, vaultPath: string): Promise<string | null> {
  const map = await loadProjectMap(vaultPath);
  const cleanCwd = stripWorktreeSuffix(cwd);

  // Exact match
  if (map[cleanCwd]) return map[cleanCwd];

  // Subdirectory match
  for (const [path, slug] of Object.entries(map)) {
    if (cleanCwd.startsWith(path + "/") || cleanCwd === path) {
      return slug;
    }
  }

  // Git root match
  const gitRoot = await getGitRoot(cwd);
  if (gitRoot) {
    const cleanGitRoot = stripWorktreeSuffix(gitRoot);
    if (map[cleanGitRoot]) return map[cleanGitRoot];

    for (const [path, slug] of Object.entries(map)) {
      if (cleanGitRoot.startsWith(path + "/") || cleanGitRoot === path) {
        return slug;
      }
    }
  }

  return null;
}

/**
 * Invalidate the cached project map.
 */
export function invalidateProjectMapCache(): void {
  cache = null;
}
