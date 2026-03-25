// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCatalog } from "./catalog.js";
import { resolveCommand } from "./resolve.js";
import { fetchSkillContent, formatSection, classifySkill } from "./helpers.js";

// ── Result Types ─────────────────────────────────────

export interface ManifestEntry {
  id: string;
  name: string;
  domains: string[];
  layer: 'core' | 'extended' | 'reference';
  description: string;
  estimated_tokens: number;
}

export interface ManifestResult {
  success: boolean;
  manifest?: ManifestEntry[];
  total_skills?: number;
  total_estimated_tokens?: number;
  error?: string;
}

// ── Manifest Command ──────────────────────────────────

export async function generateManifest(options: {
  profile?: string;
}): Promise<ManifestResult> {
  const resolution = await resolveCommand({ profile: options.profile });
  if (!resolution.success) {
    return { success: false, error: resolution.error };
  }

  const collisionWinnerIds = new Set(resolution.resolutions.map((r) => r.chosen));

  const manifest: ManifestEntry[] = [];
  for (const skillId of resolution.active_skills) {
    const entry = getCatalog().find((s) => s.id === skillId);
    if (!entry) continue;

    const layer = classifySkill(skillId, collisionWinnerIds);
    manifest.push({
      id: entry.id,
      name: entry.name,
      domains: entry.domains,
      layer,
      description: entry.description,
      estimated_tokens: 2000,
    });
  }

  const total_estimated_tokens = manifest.reduce((sum, e) => sum + e.estimated_tokens, 0);

  return {
    success: true,
    manifest,
    total_skills: manifest.length,
    total_estimated_tokens,
  };
}

// ── Load Skill Content ────────────────────────────────

export async function loadSkillContent(skillId: string): Promise<{
  success: boolean;
  content?: string;
  skill_name?: string;
  estimated_tokens?: number;
  error?: string;
}> {
  const entry = getCatalog().find((s) => s.id === skillId);

  // If not in catalog, check if it's a GitHub URL (web-discovered skill)
  if (!entry) {
    if (skillId.startsWith("https://github.com/") || skillId.startsWith("https://raw.githubusercontent.com/")) {
      const { fetchDiscoveredSkill } = await import("./web-discovery.js");
      const result = await fetchDiscoveredSkill(skillId);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const name = skillId.split("/").filter(Boolean).slice(-2, -1)[0]?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Community Skill";
      const content = `## ${name}\n<!-- source: community | url: ${skillId} -->\n<!-- ⚠️ Unverified community skill -->\n\n${result.content}`;
      return {
        success: true,
        content,
        skill_name: name,
        estimated_tokens: Math.ceil(content.length / 4),
      };
    }
    return { success: false, error: `Skill not found in catalog: ${skillId}` };
  }

  try {
    const rawContent = await fetchSkillContent(entry.source);
    const content = formatSection(entry, rawContent);
    return {
      success: true,
      content,
      skill_name: entry.name,
      estimated_tokens: Math.ceil(content.length / 4),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to fetch skill content: ${msg}` };
  }
}

// ── Skill Awareness (for resume/context injection) ────

export function getSkillAwarenessBlock(): string {
  const catalog = getCatalog();
  const sources = new Set(catalog.map(s => s.repo)).size;
  const localCount = catalog.filter(s => s.repo === "local").length;
  const totalLabel = localCount > 0
    ? `${catalog.length} skills (${catalog.length - localCount} built-in + ${localCount} installed)`
    : `${catalog.length}+ skills across ${sources} repos`;

  return [
    "",
    "## SuperSkill — Runtime Skill Router",
    "",
    "You have **superskill** — your runtime skill router. Call it whenever you're about to:",
    "",
    "- Write, review, test, or debug code",
    "- Plan, architect, or design something",
    "- Ship, deploy, or secure a system",
    "- Research, write content, or prepare materials",
    "",
    "Just describe the task: `superskill({task: \"write tests for my Go API\"})`",
    `SuperSkill picks the best matching methodology from ${totalLabel}.`,
    "",
  ].join("\n");
}
