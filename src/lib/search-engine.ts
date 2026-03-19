import { execFile } from "child_process";
import { promisify } from "util";
import { resolve, relative } from "path";
import { readFile, stat } from "fs/promises";
import { parseFrontmatter } from "./frontmatter.js";
import { escapeRegex } from "./escape-regex.js";

const execFileAsync = promisify(execFile);

export interface SearchResult {
  path: string;
  snippet: string;
  line: number;
}

/**
 * Validate that a search path stays within the vault root.
 * Throws if the path escapes the vault boundary.
 */
function validateSearchPath(vaultPath: string, searchPath: string): string {
  const resolved = resolve(vaultPath, searchPath);
  const rel = relative(vaultPath, resolved);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Search path escapes vault: ${searchPath}`);
  }
  return resolved;
}

/**
 * Convert an absolute path from rg output to a vault-relative path.
 * Uses path.relative for correctness instead of string replacement.
 */
function toRelativePath(vaultPath: string, absPath: string): string {
  return relative(vaultPath, absPath);
}

/**
 * Full-text search using ripgrep.
 */
export async function searchText(
  vaultPath: string,
  query: string,
  options: {
    pathFilter?: string;
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  const { pathFilter, limit = 10 } = options;

  const args = [
    "--json",
    "--max-count", "1", // one match per file
    "--type", "md",
    "--ignore-case",
    "--fixed-strings",
    query,
  ];

  // Validate pathFilter stays within vault
  const searchPath = pathFilter
    ? validateSearchPath(vaultPath, pathFilter)
    : vaultPath;

  try {
    const { stdout } = await execFileAsync("rg", [...args, searchPath], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });

    const results: SearchResult[] = [];

    for (const line of stdout.split("\n").filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match") {
          const absPath = parsed.data.path.text;
          const relPath = toRelativePath(vaultPath, absPath);
          const snippet = parsed.data.lines.text.trim().slice(0, 200);
          const lineNum = parsed.data.line_number;

          // Skip hidden dirs and paths escaping vault
          if (relPath.startsWith(".") || relPath.startsWith("..")) continue;

          results.push({ path: relPath, snippet, line: lineNum });
          if (results.length >= limit) break;
        }
      } catch (e: any) {
        if (e.code !== "ENOENT") {
          console.error("[search] Skipping malformed rg line:", e.message);
        }
      }
    }

    return results;
  } catch (e: any) {
    // rg exits with code 1 when no matches found
    if (e.code === 1 || e.status === 1) return [];
    throw e;
  }
}

/**
 * Structured search by frontmatter properties.
 * Scans files and filters by frontmatter fields.
 */
export async function searchStructured(
  vaultPath: string,
  filters: Record<string, string>,
  options: { limit?: number } = {}
): Promise<SearchResult[]> {
  const { limit = 10 } = options;

  const results: SearchResult[] = [];

  // Build grep patterns to narrow candidates (search for both key and value)
  // SECURITY: escape both key and value to prevent regex injection
  // Note: We search separately because YAML arrays span multiple lines
  const firstKey = Object.keys(filters)[0];
  const firstValue = filters[firstKey];
  const keyPattern = escapeRegex(firstKey) + ":";
  const valuePattern = escapeRegex(firstValue);

  let candidates: string[];
  try {
    const { stdout } = await execFileAsync("rg", [
      "--files-with-matches",
      "--type", "md",
      "--regexp", keyPattern,
      "--regexp", valuePattern,
      vaultPath,
    ], { timeout: 10_000, maxBuffer: 1024 * 1024 });
    candidates = stdout.trim().split("\n").filter(Boolean);
  } catch (e: any) {
    if (e.code === 1 || e.status === 1) return [];
    throw e;
  }

  const MAX_FILE_SIZE = 100_000; // 100 KB — skip large files in structured search

  for (const absPath of candidates) {
    if (results.length >= limit) break;

    const relPath = toRelativePath(vaultPath, absPath);
    if (relPath.startsWith(".") || relPath.startsWith("..")) continue;

    try {
      const fileStat = await stat(absPath);
      if (fileStat.size > MAX_FILE_SIZE) continue;

      const content = await readFile(absPath, "utf-8");
      const { data } = parseFrontmatter(content);

      // Check all filters match
      let match = true;
      for (const [key, value] of Object.entries(filters)) {
        const fieldValue = data[key];
        if (Array.isArray(fieldValue)) {
          if (!fieldValue.includes(value)) { match = false; break; }
        } else if (String(fieldValue) !== value) {
          match = false;
          break;
        }
      }

      if (match) {
        const lines = content.split("\n");
        const firstContentLine = lines.find(
          (l) => l.startsWith("# ") || (l.trim() && !l.startsWith("---") && !l.match(/^\w+:\s/))
        );
        results.push({
          path: relPath,
          snippet: firstContentLine?.trim().slice(0, 200) ?? "",
          line: 1,
        });
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.error(`[search] Skipping unreadable file ${absPath}:`, e.message);
      }
    }
  }

  return results;
}
