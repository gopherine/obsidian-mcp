// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { CATALOG, DOMAINS } from "./catalog.js";
import { searchGitHubForSkills, formatDiscoveryResults } from "./web-discovery.js";
import { trackActivation, trackFailedSearch, trackWebDiscovery } from "../../lib/analytics.js";
import { resolveCommand } from "./resolve.js";
import { loadSkillContent } from "./manifest.js";
import { fetchSkillContent, formatSection } from "./helpers.js";

// ── Task → Domain Mapping ────────────────────────────

export const TASK_DOMAIN_MAP: Array<{ patterns: RegExp[]; domains: string[] }> = [
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

// ── Result Type ──────────────────────────────────────

export interface ActivateResult {
  success: boolean;
  skills_loaded: Array<{ id: string; name: string; domains: string[] }>;
  content: string;
  matched_domains: string[];
  total_tokens: number;
  error?: string;
}

// ── Smart Skill Activator ─────────────────────────────

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
    trackActivation({ skill_id: options.skill_id, match_method: "skill_id", task_query: options.task, matched: true });
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
    // Track failed domain match before attempting web discovery
    trackFailedSearch(options.task, 0);

    // Web discovery fallback — search GitHub for community skills
    const discovery = await searchGitHubForSkills(options.task);
    const content = formatDiscoveryResults(options.task, discovery.results);
    trackWebDiscovery(options.task, discovery.results.length > 0);
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
  const skillsToLoad: import("./catalog.js").CatalogSkill[] = [];
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

  // Track each loaded skill activation
  const matchMethod: "domain" | "trigger" = options.domain ? "domain" : "trigger";
  for (const skill of loaded) {
    trackActivation({ skill_id: skill.id, match_method: matchMethod, task_query: options.task, matched: true });
  }

  return {
    success: true,
    skills_loaded: loaded,
    content,
    matched_domains: matchedDomains,
    total_tokens: Math.ceil(content.length / 4),
  };
}
