import { homedir } from "os";
import { resolve } from "path";

export interface Config {
  vaultPath: string;
  maxInjectTokens: number;
  sessionTtlHours: number;
}

/**
 * Validate that a project slug contains only safe characters.
 * Prevents path manipulation via project names.
 */
export function validateProjectSlug(slug: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) {
    throw new Error(
      `Invalid project slug "${slug}". Must be alphanumeric with optional dots, hyphens, underscores.`
    );
  }
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new Error(`Invalid project slug "${slug}". Must not contain path separators or traversal.`);
  }
  return slug;
}

export function loadConfig(): Config {
  const raw = process.env.VAULT_PATH ?? "~/Vaults/ai";
  const vaultPath = raw.startsWith("~")
    ? resolve(homedir(), raw.slice(2))
    : resolve(raw);

  // Bound VAULT_PATH: must be under home directory (exact prefix match)
  const home = homedir();
  if (vaultPath !== home && !vaultPath.startsWith(home + "/")) {
    throw new Error(
      `VAULT_PATH must be under home directory (${home}). Got: ${vaultPath}`
    );
  }

  const maxInjectTokens = parseInt(process.env.MAX_INJECT_TOKENS ?? "1500", 10);
  const sessionTtlHours = parseInt(process.env.SESSION_TTL_HOURS ?? "2", 10);

  return {
    vaultPath,
    maxInjectTokens: Math.max(100, Number.isNaN(maxInjectTokens) ? 1500 : maxInjectTokens),
    sessionTtlHours: Math.max(1, Number.isNaN(sessionTtlHours) ? 2 : sessionTtlHours),
  };
}
