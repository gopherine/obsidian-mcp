import { homedir } from "os";
import { resolve } from "path";
import { realpath } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Validate that a path is safe to read from outside the vault.
 * Used only by vault_init to scan git repos.
 *
 * Enforces:
 * - Must be under $HOME
 * - Must not contain .. or symlinks escaping home
 * - Must be a git repository
 */
export async function safeExternalPath(rawPath: string): Promise<string> {
  const home = homedir();
  const resolved = resolve(rawPath.startsWith("~") ? rawPath.replace("~", home) : rawPath);

  // Must be under home directory (after resolution, this catches traversal attacks)
  if (resolved !== home && !resolved.startsWith(home + "/")) {
    throw new Error(`Path must be under home directory. Got: ${resolved}`);
  }

  // Verify real path doesn't escape home (symlink check)
  try {
    const real = await realpath(resolved);
    if (real !== home && !real.startsWith(home + "/")) {
      throw new Error(`Symlink escapes home directory: ${rawPath}`);
    }
  } catch (e: any) {
    if (e.code === "ENOENT") throw new Error(`Path does not exist: ${rawPath}`);
    if (e.message?.includes("Symlink")) throw e;
    throw e;
  }

  // Must be a git repo
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: resolved, timeout: 3000 });
  } catch {
    throw new Error(`Not a git repository: ${rawPath}`);
  }

  return resolved;
}
