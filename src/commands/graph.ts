import { VaultFS, VaultError } from "../lib/vault-fs.js";
import { searchText, type SearchResult } from "../lib/search-engine.js";
import { escapeRegex } from "../lib/escape-regex.js";

export interface GraphResult {
  note: string;
  outgoing: string[];
  backlinks: string[];
}

/**
 * Find all wikilinks in a note (outgoing links).
 */
function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}

/**
 * Get related notes: outgoing links from a note + backlinks to it.
 */
export async function graphRelatedCommand(
  vaultFs: VaultFS,
  vaultPath: string,
  path: string,
  options: { hops?: number } = {}
): Promise<GraphResult> {
  const { hops = 1 } = options;

  // Read the note and extract outgoing links
  const content = await vaultFs.read(path);
  const outgoing = extractWikilinks(content);

  // Find backlinks: search for [[path]] across the vault
  const noteName = path.replace(/\.md$/, "");
  const backlinks: string[] = [];

  try {
    const results = await searchText(vaultPath, `\\[\\[${escapeRegex(noteName)}`, { limit: 50 });
    for (const result of results) {
      if (result.path !== path) {
        backlinks.push(result.path);
      }
    }
  } catch (e: unknown) {
    // Only swallow search-related errors; let unexpected ones propagate
    if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") { /* expected */ }
    else if (e instanceof Error && e.message.includes("search")) { /* search engine error */ }
    else throw e;
  }

  // For hops > 1, recursively gather links from linked notes
  if (hops > 1) {
    const secondHopOutgoing = new Set<string>();
    const secondHopBacklinks = new Set<string>();

    for (const link of [...outgoing, ...backlinks].slice(0, 10)) {
      const linkPath = link.endsWith(".md") ? link : `${link}.md`;
      try {
        const linkContent = await vaultFs.read(linkPath);
        // Outgoing links from linked notes
        for (const subLink of extractWikilinks(linkContent)) {
          if (subLink !== noteName && !outgoing.includes(subLink)) {
            secondHopOutgoing.add(subLink);
          }
        }
      } catch (e: unknown) {
        if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") { /* expected */ }
        else throw e;
      }

      // Backlinks to linked notes
      const linkName = link.replace(/\.md$/, "");
      try {
        const blResults = await searchText(vaultPath, `\\[\\[${escapeRegex(linkName)}`, { limit: 20 });
        for (const r of blResults) {
          if (r.path !== path && !backlinks.includes(r.path)) {
            secondHopBacklinks.add(r.path);
          }
        }
      } catch (e: unknown) {
        if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") { /* expected */ }
        else if (e instanceof Error && e.message.includes("search")) { /* search engine error */ }
        else throw e;
      }
    }

    return {
      note: path,
      outgoing: [...new Set([...outgoing, ...secondHopOutgoing])],
      backlinks: [...new Set([...backlinks, ...secondHopBacklinks])],
    };
  }

  return { note: path, outgoing, backlinks: [...new Set(backlinks)] };
}

/**
 * Search across all projects and group results by project.
 */
export async function graphCrossProjectCommand(
  vaultPath: string,
  query: string,
  options: { limit?: number } = {}
): Promise<Record<string, SearchResult[]>> {
  const { limit = 20 } = options;
  const results = await searchText(vaultPath, query, { limit });

  const grouped: Record<string, SearchResult[]> = {};
  for (const result of results) {
    const parts = result.path.split("/");
    const project = parts[0] === "projects" && parts.length > 1 ? parts[1] : "_shared";
    if (!grouped[project]) grouped[project] = [];
    grouped[project].push(result);
  }

  return grouped;
}

