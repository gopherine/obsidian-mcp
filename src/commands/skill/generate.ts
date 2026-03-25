// SPDX-License-Identifier: AGPL-3.0-or-later
import { VaultFS } from "../../lib/vault-fs.js";
import { getCatalog } from "./catalog.js";
import type { CatalogSkill } from "./catalog.js";
import { resolveCommand } from "./resolve.js";
import {
  type LayerName,
  fetchSkillContent,
  formatSection,
  assembleSuperSkill,
  classifySkill,
} from "./helpers.js";

// ── Result Types ─────────────────────────────────────

export interface LayerInfo {
  path: string;
  skill_count: number;
  estimated_tokens: number;
}

export interface GenerateResult {
  success: boolean;
  layers?: {
    core: LayerInfo;
    extended: LayerInfo;
    reference: LayerInfo;
  };
  total_skills?: number;
  fetch_errors?: string[];
  error?: string;
  filtered_out?: number;
  // pipe-mode: raw content instead of files
  pipe_content?: string;
}

// ── Parallel Fetcher ─────────────────────────────────

type FetchResult = { content: string } | { error: string };

async function fetchAllSkills(
  skillIds: string[],
  concurrency: number,
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>();

  // Split into chunks to bound concurrency
  const chunks: string[][] = [];
  for (let i = 0; i < skillIds.length; i += concurrency) {
    chunks.push(skillIds.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map(async (id): Promise<{ id: string; content: string } | { id: string; error: string }> => {
        const entry = getCatalog().find((s) => s.id === id);
        if (!entry) return { id, error: "not in catalog" };
        const content = await fetchSkillContent(entry.source);
        return { id, content };
      }),
    );

    for (let i = 0; i < settled.length; i++) {
      const id = chunk[i];
      const r = settled[i];
      if (r.status === "fulfilled") {
        const val = r.value;
        if ("error" in val) {
          results.set(id, { error: val.error });
        } else {
          results.set(id, { content: val.content });
        }
      } else {
        results.set(id, { error: String(r.reason) });
      }
    }
  }

  return results;
}

// ── Generate Command ──────────────────────────────────

export async function generateCommand(
  vaultFs: VaultFS,
  _vaultPath: string,
  options: {
    profile?: string;
    includeNonColliding?: boolean;
    outputPath?: string;
    pipe?: boolean;
    pipeLayer?: LayerName | 'all';
    relevantDomains?: string[];
  },
): Promise<GenerateResult> {
  const CONCURRENCY = 8;

  // 1. Resolve
  const resolution = await resolveCommand({ profile: options.profile });
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  // 2. Determine active skills
  let activeSkillIds: string[];
  if (options.includeNonColliding === false) {
    activeSkillIds = resolution.resolutions.map((r) => r.chosen);
  } else {
    activeSkillIds = resolution.active_skills;
  }

  // 2b. Domain filter: only keep skills whose domains overlap with relevantDomains
  let filteredOut = 0;
  if (options.relevantDomains && options.relevantDomains.length > 0) {
    const relevantSet = new Set(options.relevantDomains);
    const before = activeSkillIds.length;
    activeSkillIds = activeSkillIds.filter((id) => {
      const entry = getCatalog().find((s) => s.id === id);
      if (!entry) return true; // keep unknowns, they'll fail at fetch
      return entry.domains.some((d) => relevantSet.has(d));
    });
    filteredOut = before - activeSkillIds.length;
  }

  // Track which skill IDs are collision winners (always core)
  const collisionWinnerIds = new Set(resolution.resolutions.map((r) => r.chosen));

  // 3. Parallel fetch
  const fetchResults = await fetchAllSkills(activeSkillIds, CONCURRENCY);

  const fetchErrors: string[] = [];
  const buckets: Record<LayerName, Array<{ skill: CatalogSkill; section: string }>> = {
    core: [],
    extended: [],
    reference: [],
  };

  for (const skillId of activeSkillIds) {
    const result = fetchResults.get(skillId);
    if (!result) {
      fetchErrors.push(`${skillId}: fetch result missing`);
      continue;
    }
    if ("error" in result) {
      fetchErrors.push(`${skillId}: ${result.error}`);
      continue;
    }

    const entry = getCatalog().find((s) => s.id === skillId);
    if (!entry) {
      fetchErrors.push(`${skillId}: not found in catalog`);
      continue;
    }

    const layer = classifySkill(skillId, collisionWinnerIds);
    buckets[layer].push({
      skill: entry,
      section: formatSection(entry, result.content),
    });
  }

  const totalFetched = buckets.core.length + buckets.extended.length + buckets.reference.length;
  if (totalFetched === 0) {
    return {
      success: false,
      error: "No skills could be fetched",
      fetch_errors: fetchErrors,
    };
  }

  // 4. Assemble each layer
  const profileName = resolution.profile_name;

  function assembleLayer(layer: LayerName): string {
    const items = buckets[layer];
    const sections = items.map((i) => i.section);
    const domainsCovered = new Set(items.flatMap((i) => i.skill.domains));

    return assembleSuperSkill({
      layer,
      profileName,
      sections,
      skillCount: sections.length,
      domainCount: domainsCovered.size,
      fetchErrors: layer === 'core' ? fetchErrors : [],
    });
  }

  const coreContent = assembleLayer('core');
  const extContent = assembleLayer('extended');
  const refContent = assembleLayer('reference');

  // 5. Pipe mode — write to stdout, skip vault
  if (options.pipe) {
    const pipeLayer = options.pipeLayer ?? 'core';
    let content: string;
    if (pipeLayer === 'all') {
      content = [coreContent, extContent, refContent].join('\n\n');
    } else if (pipeLayer === 'extended') {
      content = extContent;
    } else if (pipeLayer === 'reference') {
      content = refContent;
    } else {
      content = coreContent;
    }
    return {
      success: true,
      pipe_content: content,
      total_skills: totalFetched,
      fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,
      filtered_out: filteredOut > 0 ? filteredOut : undefined,
    };
  }

  // 6. Write three files
  const corePath = "skills/super-skill/SKILL.md";
  const extPath = "skills/super-skill/SKILL-extended.md";
  const refPath = "skills/super-skill/SKILL-reference.md";

  await vaultFs.write(corePath, coreContent);
  await vaultFs.write(extPath, extContent);
  await vaultFs.write(refPath, refContent);

  const estimateTokens = (s: string) => Math.ceil(s.length / 4);

  return {
    success: true,
    layers: {
      core: {
        path: corePath,
        skill_count: buckets.core.length,
        estimated_tokens: estimateTokens(coreContent),
      },
      extended: {
        path: extPath,
        skill_count: buckets.extended.length,
        estimated_tokens: estimateTokens(extContent),
      },
      reference: {
        path: refPath,
        skill_count: buckets.reference.length,
        estimated_tokens: estimateTokens(refContent),
      },
    },
    total_skills: totalFetched,
    fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,
    filtered_out: filteredOut > 0 ? filteredOut : undefined,
  };
}
