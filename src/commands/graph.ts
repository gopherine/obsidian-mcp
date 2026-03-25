// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CommandContext } from "../core/types.js";
import { VaultFS, VaultError } from "../lib/vault-fs.js";
import { searchText, type SearchResult } from "../lib/search-engine.js";

export interface GraphResult {
  note: string;
  outgoing: string[];
  backlinks: string[];
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}

export async function graphRelatedCommand(
  args: {
    path: string;
    hops?: number;
  } = {} as any,
  ctx: CommandContext,
): Promise<GraphResult> {
  const { path, hops = 1 } = args;
  const vaultFs = ctx.vaultFs;
  const vaultPath = ctx.vaultPath;

  const content = await vaultFs.read(path);
  const outgoing = extractWikilinks(content);

  const noteName = path.replace(/\.md$/, "");
  const backlinks: string[] = [];

  try {
    const results = await searchText(vaultPath, `[[${noteName}`, { limit: 50 });
    for (const result of results) {
      if (result.path !== path) {
        backlinks.push(result.path);
      }
    }
  } catch (e: unknown) {
    if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") { /* expected */ }
    else if (e instanceof Error && e.message.includes("search")) { /* search engine error */ }
    else throw e;
  }

  if (hops > 1) {
    const secondHopOutgoing = new Set<string>();
    const secondHopBacklinks = new Set<string>();

    for (const link of [...outgoing, ...backlinks].slice(0, 10)) {
      const linkPath = link.endsWith(".md") ? link : `${link}.md`;
      try {
        const linkContent = await vaultFs.read(linkPath);
        for (const subLink of extractWikilinks(linkContent)) {
          if (subLink !== noteName && !outgoing.includes(subLink)) {
            secondHopOutgoing.add(subLink);
          }
        }
      } catch (e: unknown) {
        if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") { /* expected */ }
        else throw e;
      }

      const linkName = link.replace(/\.md$/, "");
      try {
        const blResults = await searchText(vaultPath, `[[${linkName}`, { limit: 20 });
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

export async function graphCrossProjectCommand(
  args: {
    query: string;
    limit?: number;
  } = {} as any,
  ctx: CommandContext,
): Promise<Record<string, SearchResult[]>> {
  const { query, limit = 20 } = args;
  const results = await searchText(ctx.vaultPath, query, { limit });

  const grouped: Record<string, SearchResult[]> = {};
  for (const result of results) {
    const parts = result.path.split("/");
    const project = parts[0] === "projects" && parts.length > 1 ? parts[1] : "_shared";
    if (!grouped[project]) grouped[project] = [];
    grouped[project].push(result);
  }

  return grouped;
}
