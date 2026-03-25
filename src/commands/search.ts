// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CommandContext } from "../core/types.js";
import { searchText, searchStructured, type SearchResult } from "../lib/search-engine.js";

export async function searchCommand(
  args: {
    query: string;
    project?: string;
    limit?: number;
    structured?: boolean;
  } = {} as any,
  ctx: CommandContext,
): Promise<SearchResult[]> {
  const { query, project, limit = 10, structured = false } = args;
  const vaultPath = ctx.vaultPath;

  if (structured) {
    const filters: Record<string, string> = {};
    for (const part of query.split(/\s+/)) {
      const idx = part.indexOf(":");
      if (idx > 0) {
        const key = part.slice(0, idx);
        const value = part.slice(idx + 1);
        if (key && value) {
          filters[key] = value;
        }
      }
    }
    if (project && !filters.project) {
      filters.project = project;
    }
    return searchStructured(vaultPath, filters, { limit });
  }

  const pathFilter = project ? `projects/${project}` : undefined;
  return searchText(vaultPath, query, { pathFilter, limit });
}
