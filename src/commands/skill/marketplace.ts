// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { readFile } from "fs/promises";
import { VaultFS } from "../../lib/vault-fs.js";
import {
  CATALOG,
  DOMAINS,
  DOMAIN_PRIORITY,
  detectCollisions,
  searchCatalog,
  getProfile,
  BUILT_IN_PROFILES,
} from "./catalog.js";
import type { CatalogSkill } from "./catalog.js";
import { searchGitHubForSkills, formatDiscoveryResults } from "./web-discovery.js";

// ── Result Types ─────────────────────────────────────

export interface CatalogResult {
  total: number;
  repos: { repo: string; count: number }[];
  domains: { id: string; name: string; skill_count: number }[];
  skills: CatalogSkill[];
}

export interface CollisionResult {
  collisions: Array<{
    domain_id: string;
    domain_name: string;
    skills: Array<{ id: string; name: string; repo: string; description: string }>;
  }>;
  total_collision_domains: number;
  total_affected_skills: number;
}

export interface ResolveResult {
  success: boolean;
  profile_name: string;
  resolutions: Array<{
    domain: string;
    chosen: string;
    alternatives: string[];
  }>;
  active_skills: string[];
  error?: string;
}

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

// ── Commands ─────────────────────────────────────────

export async function catalogCommand(options: {
  domain?: string;
  repo?: string;
  search?: string;
}): Promise<CatalogResult> {
  const filtered = searchCatalog({
    domain: options.domain,
    repo: options.repo,
    text: options.search,
  });

  const repoCount = new Map<string, number>();
  const domainSkills = new Map<string, Set<string>>();

  for (const skill of filtered) {
    repoCount.set(skill.repo, (repoCount.get(skill.repo) ?? 0) + 1);
    for (const d of skill.domains) {
      const set = domainSkills.get(d) ?? new Set();
      set.add(skill.id);
      domainSkills.set(d, set);
    }
  }

  return {
    total: filtered.length,
    repos: Array.from(repoCount.entries())
      .map(([repo, count]) => ({ repo, count }))
      .sort((a, b) => b.count - a.count),
    domains: Array.from(domainSkills.entries())
      .map(([id, skills]) => ({
        id,
        name: DOMAINS.find((d) => d.id === id)?.name ?? id,
        skill_count: skills.size,
      }))
      .sort((a, b) => b.skill_count - a.skill_count),
    skills: filtered,
  };
}

export async function collisionsCommand(): Promise<CollisionResult> {
  const collisions = detectCollisions();
  const affected = new Set<string>();

  const mapped = collisions.map((c) => {
    const skills = c.skills.map((s) => {
      affected.add(s.id);
      return { id: s.id, name: s.name, repo: s.repo, description: s.description };
    });
    return {
      domain_id: c.domain.id,
      domain_name: c.domain.name,
      skills,
    };
  });

  return {
    collisions: mapped,
    total_collision_domains: mapped.length,
    total_affected_skills: affected.size,
  };
}

export async function resolveCommand(options: {
  profile?: string;
}): Promise<ResolveResult> {
  const profileName = options.profile ?? "ecc-first";
  const profile = getProfile(profileName);

  if (!profile) {
    const available = BUILT_IN_PROFILES.map((p) => p.name).join(", ");
    return {
      success: false,
      profile_name: profileName,
      resolutions: [],
      active_skills: [],
      error: `Unknown profile: "${profileName}". Available: ${available}`,
    };
  }

  const collisions = detectCollisions();
  const collisionDomainIds = new Set(collisions.map((c) => c.domain.id));

  // Build resolution report
  const resolutions = profile.resolutions.map((r) => {
    const collision = collisions.find((c) => c.domain.id === r.domain_id);
    return {
      domain: r.domain_id,
      chosen: r.chosen_skill_id,
      alternatives: collision
        ? collision.skills.filter((s) => s.id !== r.chosen_skill_id).map((s) => s.id)
        : [],
    };
  });

  // Collect active skill IDs: chosen winners + all non-colliding skills
  const activeSkillIds = new Set<string>();

  // Add collision winners
  for (const r of profile.resolutions) {
    activeSkillIds.add(r.chosen_skill_id);
  }

  // Add non-colliding skills (domains with only one repo)
  for (const skill of CATALOG) {
    const allDomainsNonColliding = skill.domains.every((d) => !collisionDomainIds.has(d));
    if (allDomainsNonColliding) {
      activeSkillIds.add(skill.id);
    }
  }

  return {
    success: true,
    profile_name: profileName,
    resolutions,
    active_skills: [...activeSkillIds].sort(),
  };
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
        const entry = CATALOG.find((s) => s.id === id);
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

// ── Layer partitioner ─────────────────────────────────

type LayerName = 'core' | 'extended' | 'reference';

function classifySkill(skillId: string, collisionWinnerIds: Set<string>): LayerName {
  // Collision winners always go to core
  if (collisionWinnerIds.has(skillId)) return 'core';

  const entry = CATALOG.find((s) => s.id === skillId);
  if (!entry) return 'reference';

  // Use highest-priority domain
  let best: LayerName = 'reference';
  for (const domain of entry.domains) {
    const priority = DOMAIN_PRIORITY[domain];
    if (priority === 'core') return 'core';
    if (priority === 'extended') best = 'extended';
  }
  return best;
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
      const entry = CATALOG.find((s) => s.id === id);
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

    const entry = CATALOG.find((s) => s.id === skillId);
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
    const entry = CATALOG.find((s) => s.id === skillId);
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
  const entry = CATALOG.find((s) => s.id === skillId);

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

// ── Smart Skill Activator ─────────────────────────────

const TASK_DOMAIN_MAP: Array<{ patterns: RegExp[]; domains: string[] }> = [
  // Core workflow domains
  { patterns: [/brainstorm/i, /ideate/i, /explore ideas/i, /think through/i, /what if/i], domains: ["brainstorming"] },
  { patterns: [/test/i, /tdd/i, /spec/i, /coverage/i, /unit test/i, /assert/i], domains: ["tdd"] },
  { patterns: [/review/i, /code review/i, /pr review/i, /pull request/i, /feedback/i], domains: ["code-review"] },
  { patterns: [/plan/i, /architect/i, /design.*system/i, /implementation plan/i, /roadmap/i], domains: ["planning"] },
  { patterns: [/debug/i, /investigate/i, /fix.*bug/i, /troubleshoot/i, /error/i, /broken/i], domains: ["debugging"] },
  { patterns: [/secur/i, /vulnerab/i, /owasp/i, /auth.*review/i, /pentest/i, /hardening/i], domains: ["security"] },
  { patterns: [/deploy/i, /\bship\b/i, /release/i, /ci.?cd/i, /rollback/i, /production/i], domains: ["shipping"] },
  { patterns: [/verify/i, /validate/i, /check.*build/i, /lint/i, /type.?check/i], domains: ["verification"] },
  { patterns: [/frontend/i, /ui\b/i, /ux\b/i, /component/i, /design.*page/i, /css/i, /tailwind/i, /layout/i], domains: ["frontend-design"] },
  { patterns: [/agent/i, /orchestrat/i, /subagent/i, /parallel.*agent/i, /multi.*agent/i], domains: ["agent-orchestration"] },
  { patterns: [/database/i, /sql\b/i, /schema/i, /migration/i, /postgres/i, /mysql/i, /supabase/i, /sql.*query/i, /db.*query/i], domains: ["database"] },
  // Language and framework domains
  { patterns: [/golang/i, /go test/i, /goroutine/i, /go mod/i, /go func/i, /go package/i], domains: ["go"] },
  { patterns: [/python/i, /pytest/i, /pip/i, /django/i, /flask/i, /fastapi/i], domains: ["python"] },
  { patterns: [/django/i, /drf\b/i, /django rest/i], domains: ["django"] },
  { patterns: [/spring/i, /spring boot/i, /java\b/i, /jpa\b/i, /hibernate/i, /maven/i, /gradle/i], domains: ["spring-boot", "java"] },
  { patterns: [/swift/i, /swiftui/i, /ios\b/i, /xcode/i, /uikit/i], domains: ["swift"] },
  { patterns: [/\bc\+\+/i, /cpp\b/i, /cmake/i, /clang/i], domains: ["cpp"] },
  { patterns: [/docker/i, /container/i, /compose/i, /dockerfile/i, /k8s/i, /kubernetes/i], domains: ["docker"] },
  // API and patterns
  { patterns: [/api design/i, /rest api/i, /endpoint/i, /pagination/i, /rate limit/i], domains: ["api-design"] },
  { patterns: [/react/i, /next\.?js/i, /state management/i, /hooks/i, /redux/i], domains: ["frontend-patterns"] },
  { patterns: [/express/i, /node\.?js/i, /server.*pattern/i, /middleware/i, /backend/i], domains: ["backend-patterns"] },
  { patterns: [/coding standard/i, /style guide/i, /convention/i, /best practice/i], domains: ["coding-standards"] },
  { patterns: [/git/i, /branch/i, /worktree/i, /merge/i, /rebase/i], domains: ["git-workflow"] },
  // Content and business
  { patterns: [/write.*article/i, /blog.*post/i, /content/i, /newsletter/i, /copywriting/i], domains: ["content-business"] },
  { patterns: [/market.*research/i, /competitor/i, /competitive/i, /due diligence/i, /market siz/i], domains: ["content-business"] },
  { patterns: [/investor/i, /pitch.*deck/i, /fundrais/i, /outreach/i, /cold email/i], domains: ["content-business"] },
  { patterns: [/linkedin/i, /twitter/i, /social media/i, /marketing/i, /launch post/i], domains: ["content-business"] },
  // 3D and animation
  { patterns: [/three\.?js/i, /webgl/i, /3d\b/i, /animation/i, /gsap/i, /framer/i], domains: ["3d-animation"] },
  // Agent engineering
  { patterns: [/agent.*harness/i, /agent.*eval/i, /cost.*optim/i, /agent.*loop/i, /agent.*engineer/i, /eval.*pipeline/i], domains: ["agent-engineering"] },
  // Meta / tooling
  { patterns: [/skill.*manage/i, /compaction/i, /skill.*install/i, /learning.*capture/i], domains: ["meta"] },
];

export function matchTaskToDomains(task: string): string[] {
  const matched = new Set<string>();
  for (const entry of TASK_DOMAIN_MAP) {
    for (const pattern of entry.patterns) {
      if (pattern.test(task)) {
        for (const d of entry.domains) matched.add(d);
      }
    }
  }
  return [...matched];
}

export interface ActivateResult {
  success: boolean;
  skills_loaded: Array<{ id: string; name: string; domains: string[] }>;
  content: string;
  matched_domains: string[];
  total_tokens: number;
  error?: string;
}

export async function activateSkills(options: {
  task: string;
  profile?: string;
  skill_id?: string;
  domain?: string;
}): Promise<ActivateResult> {
  // Direct skill load by ID
  if (options.skill_id) {
    const result = await loadSkillContent(options.skill_id);
    if (!result.success) {
      return { success: false, skills_loaded: [], content: "", matched_domains: [], total_tokens: 0, error: result.error };
    }
    const entry = CATALOG.find((s) => s.id === options.skill_id);
    return {
      success: true,
      skills_loaded: [{ id: options.skill_id, name: entry?.name ?? options.skill_id, domains: entry?.domains ?? [] }],
      content: result.content!,
      matched_domains: entry?.domains ?? [],
      total_tokens: result.estimated_tokens ?? 0,
    };
  }

  // Route 1: LLM passed domain directly (preferred — LLM understands intent best)
  // Route 2: Keyword fallback from task description
  let matchedDomains: string[];
  if (options.domain) {
    // LLM picked the domain(s) — trust it. Support comma-separated.
    matchedDomains = options.domain.split(",").map((d) => d.trim()).filter((d) =>
      DOMAINS.some((dom) => dom.id === d)
    );
  } else {
    matchedDomains = matchTaskToDomains(options.task);
  }

  if (matchedDomains.length === 0) {
    // Web discovery fallback — search GitHub for community skills
    const discovery = await searchGitHubForSkills(options.task);
    const content = formatDiscoveryResults(options.task, discovery.results);
    return {
      success: true,
      skills_loaded: [],
      content,
      matched_domains: [],
      total_tokens: 0,
    };
  }

  // Resolve which skill wins per domain
  const resolution = await resolveCommand({ profile: options.profile });
  const winnerMap = new Map<string, string>();
  for (const r of resolution.resolutions) {
    winnerMap.set(r.domain, r.chosen);
  }

  // For each matched domain, load collision winner + up to 2 alternatives (max 3 per domain)
  const MAX_SKILLS_PER_DOMAIN = 3;
  const skillsToLoad: CatalogSkill[] = [];
  const seenIds = new Set<string>();

  for (const domain of matchedDomains) {
    let domainCount = 0;
    // Collision winner goes first if present
    const winnerId = winnerMap.get(domain);
    if (winnerId && !seenIds.has(winnerId)) {
      const entry = CATALOG.find((s) => s.id === winnerId);
      if (entry) {
        skillsToLoad.push(entry);
        seenIds.add(winnerId);
        domainCount++;
      }
    }
    // Then other skills in this domain, up to the cap
    for (const skill of CATALOG) {
      if (domainCount >= MAX_SKILLS_PER_DOMAIN) break;
      if (skill.domains.includes(domain) && !seenIds.has(skill.id)) {
        skillsToLoad.push(skill);
        seenIds.add(skill.id);
        domainCount++;
      }
    }
  }

  if (skillsToLoad.length === 0) {
    return { success: true, skills_loaded: [], content: "No skills available for matched domains: " + matchedDomains.join(", "), matched_domains: matchedDomains, total_tokens: 0 };
  }

  // Fetch all matched skills in parallel
  const fetchResults = await Promise.allSettled(
    skillsToLoad.map(async (entry) => {
      const raw = await fetchSkillContent(entry.source);
      return { entry, content: formatSection(entry, raw) };
    })
  );

  const sections: string[] = [];
  const loaded: ActivateResult["skills_loaded"] = [];

  for (const result of fetchResults) {
    if (result.status === "fulfilled") {
      sections.push(result.value.content);
      loaded.push({
        id: result.value.entry.id,
        name: result.value.entry.name,
        domains: result.value.entry.domains,
      });
    }
  }

  const content = sections.join("\n\n---\n\n");

  return {
    success: true,
    skills_loaded: loaded,
    content,
    matched_domains: matchedDomains,
    total_tokens: Math.ceil(content.length / 4),
  };
}

// ── Skill Awareness (for resume/context injection) ────

export function getSkillAwarenessBlock(): string {
  return [
    "",
    "## SuperSkill — Expert Methodologies",
    "",
    "You have **superskill** — your skill package manager. Call it whenever you're about to:",
    "",
    "- Write, review, test, or debug code",
    "- Plan, architect, or design something",
    "- Ship, deploy, or secure a system",
    "- Research, write content, or prepare materials",
    "",
    "Just describe the task: `superskill({task: \"write tests for my Go API\"})`",
    "SuperSkill finds the right methodology from " + CATALOG.length + "+ skills across " + new Set(CATALOG.map(s => s.repo)).size + " repos.",
    "",
  ].join("\n");
}

// ── Helpers ──────────────────────────────────────────

async function fetchSkillContent(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  }
  return readFile(source, "utf-8");
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/, "").trim();
}

function formatSection(skill: CatalogSkill, rawContent: string): string {
  const body = stripFrontmatter(rawContent);
  return [
    `## ${skill.name}`,
    `<!-- source: ${skill.repo} | domains: ${skill.domains.join(", ")} | id: ${skill.id} -->`,
    "",
    body,
  ].join("\n");
}

function assembleSuperSkill(opts: {
  layer: 'core' | 'extended' | 'reference';
  profileName: string;
  sections: string[];
  skillCount: number;
  domainCount: number;
  fetchErrors: string[];
}): string {
  const now = new Date().toISOString();
  const layerLabel: Record<string, string> = {
    core: "Core — always loaded",
    extended: "Extended — medium+ context models",
    reference: "Reference — large context models only",
  };
  const estimatedTokens = Math.ceil(opts.sections.join("").length / 4);

  const lines: string[] = [
    "---",
    "name: super-skill",
    `layer: ${opts.layer}`,
    `description: ${layerLabel[opts.layer]} — ${opts.skillCount} skills across ${opts.domainCount} domains`,
    `version: ${now.slice(0, 10)}`,
    `estimated_tokens: ${estimatedTokens}`,
    "---",
    "",
    `# Super Skill — ${opts.layer.charAt(0).toUpperCase() + opts.layer.slice(1)}`,
    "",
    `> Generated by **superskill** skill marketplace`,
    `> Profile: **${opts.profileName}** | Layer: **${opts.layer}** | Skills: **${opts.skillCount}** | Domains: **${opts.domainCount}** | Generated: ${now}`,
    "",
  ];

  if (opts.fetchErrors.length > 0) {
    lines.push("## Fetch Errors", "");
    for (const err of opts.fetchErrors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }

  if (opts.sections.length > 0) {
    lines.push(opts.sections.join("\n\n---\n\n"));
    lines.push("");
  }

  return lines.join("\n");
}
