import { searchText, searchStructured, type SearchResult } from "../lib/search-engine.js";

export async function searchCommand(
  vaultPath: string,
  query: string,
  options: {
    project?: string;
    limit?: number;
    structured?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const { project, limit = 10, structured = false } = options;

  if (structured) {
    // Parse structured query: "type:adr project:permanu status:active"
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
