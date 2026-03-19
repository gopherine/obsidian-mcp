import { mkdir, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { execFile } from "child_process";

export async function createTestVault(options?: {
  project?: string;
}): Promise<{ vaultRoot: string; cleanup: () => Promise<void> }> {
  const vaultRoot = join(
    homedir(),
    `.vault-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(vaultRoot, { recursive: true });

  const slug = options?.project ?? "test-project";
  const projectMap = { projects: { [slug]: vaultRoot } };
  await writeFile(
    join(vaultRoot, "project-map.json"),
    JSON.stringify(projectMap, null, 2)
  );
  await mkdir(join(vaultRoot, `projects/${slug}`), { recursive: true });

  const cleanup = async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  };

  return { vaultRoot, cleanup };
}

export function runCli(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    const binPath = resolve(dirname(new URL(import.meta.url).pathname), "..", "dist", "cli.js");
    const child = execFile(
      "node",
      [binPath, ...args],
      {
        cwd: options?.cwd,
        env: { ...process.env, ...options?.env },
        timeout: 10000,
      },
      (error, stdout, stderr) => {
        resolvePromise({
          stdout,
          stderr,
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        });
      }
    );
  });
}

export const CLAUDE_MD = "# Project\n\nThis is a test project.\n\n## Commands\n\n- `npm run build`: Build the project\n";
