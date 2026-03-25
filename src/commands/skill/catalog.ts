// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Skill catalog — backward-compatible facade over the registry.
 *
 * Previously this file contained hardcoded arrays. Now it delegates to
 * the JSON registry via registry-loader.ts while keeping the same exports
 * so downstream code (activate.ts, resolve.ts, generate.ts, etc.) doesn't break.
 *
 * The registry is loaded lazily on first access. If the registry hasn't been
 * loaded yet (e.g., in synchronous contexts), the static FALLBACK arrays are
 * used as a safety net.
 */

import type { RegistryData, RegistryDomain, RegistrySkill, RegistryProfile } from "../../lib/registry-loader.js";

// ── Types (unchanged API) ────────────────────────────

export interface SkillDomain {
  id: string;
  name: string;
  description: string;
}

export interface CatalogSkill {
  id: string;           // "repo/skill-name"
  name: string;
  repo: string;
  domains: string[];
  description: string;
  source: string;       // URL or local path to SKILL.md
  tags?: string[];
  triggers?: string[];  // NEW: trigger keywords from registry
}

// SkillRepo is now a string — community repos can be added via registry
export type SkillRepo = string;

export interface Collision {
  domain: SkillDomain;
  skills: CatalogSkill[];
}

export interface ProfileResolution {
  domain_id: string;
  chosen_skill_id: string;
}

export interface SkillProfile {
  name: string;
  description: string;
  resolutions: ProfileResolution[];
}

// ── Registry Bridge ──────────────────────────────────

let _registryData: RegistryData | null = null;

/**
 * Set registry data for this module. Called by registry-loader after loading.
 * This is the bridge between async registry loading and synchronous catalog access.
 */
export function setRegistryData(data: RegistryData): void {
  _registryData = data;
}

/** Clear registry data. Used for testing. */
export function _clearRegistryData(): void {
  _registryData = null;
}

/** Check if registry data is loaded. */
export function hasRegistryData(): boolean {
  return _registryData !== null;
}

function registryDomainToSkillDomain(d: RegistryDomain): SkillDomain {
  return { id: d.id, name: d.name, description: d.description };
}

function registrySkillToCatalogSkill(s: RegistrySkill, data: RegistryData): CatalogSkill {
  const source = data.sources[s.source];
  const sourceUrl = source ? `${source.base_url}/${s.path}` : s.path;
  return {
    id: s.id,
    name: s.name,
    repo: s.source,
    domains: s.domains,
    description: s.description,
    source: sourceUrl,
    tags: s.tags,
    triggers: s.triggers,
  };
}

function registryProfileToSkillProfile(p: RegistryProfile): SkillProfile {
  return {
    name: p.name,
    description: p.description,
    resolutions: p.resolutions.map((r) => ({
      domain_id: r.domain_id,
      chosen_skill_id: r.chosen_skill_id,
    })),
  };
}

// ── Static Fallback URLs (used when registry not loaded) ─────

const GH_ECC = "https://raw.githubusercontent.com/affaan-m/everything-claude-code/main";
const GH_SP = "https://raw.githubusercontent.com/obra/superpowers/main";

// Minimal fallback domains — only used if registry fails to load
const FALLBACK_DOMAINS: SkillDomain[] = [
  { id: "tdd", name: "Test-Driven Development", description: "TDD workflow and testing patterns" },
  { id: "planning", name: "Planning", description: "Implementation planning and review" },
  { id: "code-review", name: "Code Review", description: "Reviewing and receiving code feedback" },
  { id: "debugging", name: "Debugging", description: "Systematic debugging and investigation" },
  { id: "verification", name: "Verification", description: "Pre-completion verification checks" },
  { id: "brainstorming", name: "Brainstorming", description: "Ideation and exploratory thinking" },
  { id: "agent-orchestration", name: "Agent Orchestration", description: "Multi-agent loops and pipelines" },
  { id: "security", name: "Security", description: "Security review, scanning, guardrails" },
  { id: "shipping", name: "Shipping", description: "Deployment and release workflow" },
  { id: "frontend-design", name: "Frontend Design", description: "UI/UX design and component systems" },
  { id: "git-workflow", name: "Git Workflow", description: "Branching, worktrees, merge workflow" },
  { id: "go", name: "Go", description: "Go idioms, patterns, testing, review" },
  { id: "python", name: "Python", description: "Python idioms, patterns, testing, review" },
  { id: "django", name: "Django", description: "Django framework patterns and security" },
  { id: "spring-boot", name: "Spring Boot", description: "Spring Boot patterns and testing" },
  { id: "swift", name: "Swift", description: "Swift/iOS/SwiftUI patterns" },
  { id: "cpp", name: "C++", description: "C++ patterns and testing" },
  { id: "java", name: "Java", description: "Java patterns and standards" },
  { id: "database", name: "Database", description: "Database patterns and migrations" },
  { id: "docker", name: "Docker", description: "Docker and Compose patterns" },
  { id: "api-design", name: "API Design", description: "REST API design patterns" },
  { id: "frontend-patterns", name: "Frontend Patterns", description: "React/Next.js patterns" },
  { id: "backend-patterns", name: "Backend Patterns", description: "Node/Express patterns" },
  { id: "coding-standards", name: "Coding Standards", description: "Universal coding standards" },
  { id: "content-business", name: "Content & Business", description: "Writing, marketing, investor materials" },
  { id: "3d-animation", name: "3D Animation", description: "WebGL, Three.js, animation workflows" },
  { id: "agent-engineering", name: "Agent Engineering", description: "Agent harness, eval, cost optimization" },
  { id: "meta", name: "Meta/Tooling", description: "Skill management, compaction, learning" },
];

// Minimal fallback catalog — only the 8 prefetch skills
const FALLBACK_CATALOG: CatalogSkill[] = [
  { id: "superpowers/brainstorming", name: "Brainstorming", repo: "superpowers", domains: ["brainstorming"], description: "Structured brainstorming before creative work", source: `${GH_SP}/skills/brainstorming/SKILL.md` },
  { id: "ecc/plan", name: "/plan", repo: "ecc", domains: ["planning"], description: "Implementation planning slash command", source: `${GH_ECC}/commands/plan.md` },
  { id: "ecc/tdd-workflow", name: "TDD Workflow", repo: "ecc", domains: ["tdd"], description: "Full TDD red-green-refactor loop with 80%+ coverage", source: `${GH_ECC}/skills/tdd-workflow/SKILL.md` },
  { id: "ecc/go-review", name: "Go Review", repo: "ecc", domains: ["code-review", "go"], description: "Go code review for idioms and concurrency", source: `${GH_ECC}/commands/go-review.md` },
  { id: "superpowers/systematic-debugging", name: "Systematic Debugging", repo: "superpowers", domains: ["debugging"], description: "Step-by-step debugging methodology", source: `${GH_SP}/skills/systematic-debugging/SKILL.md` },
  { id: "ecc/security-review", name: "Security Review", repo: "ecc", domains: ["security"], description: "Auth, input validation, secrets, OWASP checklist", source: `${GH_ECC}/skills/security-review/SKILL.md` },
  { id: "ecc/verification-loop", name: "Verification Loop", repo: "ecc", domains: ["verification"], description: "Build/types/lint/test verification gates", source: `${GH_ECC}/skills/verification-loop/SKILL.md` },
  { id: "ecc/deployment-patterns", name: "Deployment Patterns", repo: "ecc", domains: ["shipping"], description: "CI/CD, Docker, health checks, rollbacks", source: `${GH_ECC}/skills/deployment-patterns/SKILL.md` },
];

const FALLBACK_PRIORITY: Record<string, 'core' | 'extended' | 'reference'> = {
  tdd: 'core', planning: 'core', 'code-review': 'core',
  debugging: 'core', verification: 'core', brainstorming: 'core',
  'agent-orchestration': 'core', security: 'core', shipping: 'core',
  'frontend-design': 'core', 'git-workflow': 'core',
  go: 'extended', python: 'extended', django: 'extended',
  'spring-boot': 'extended', swift: 'extended', cpp: 'extended',
  java: 'extended', database: 'extended', docker: 'extended',
  'api-design': 'extended', 'frontend-patterns': 'extended',
  'backend-patterns': 'extended', 'coding-standards': 'extended',
  'content-business': 'reference', '3d-animation': 'reference',
  'agent-engineering': 'reference', meta: 'reference',
};

// ── Public Getters (backward-compatible) ─────────────

/**
 * Get all domains. Uses registry if loaded, fallback otherwise.
 */
export function getDomains(): SkillDomain[] {
  if (_registryData) return _registryData.domains.map(registryDomainToSkillDomain);
  return FALLBACK_DOMAINS;
}

/**
 * Get the full skill catalog. Uses registry if loaded, fallback otherwise.
 */
export function getCatalog(): CatalogSkill[] {
  if (_registryData) return _registryData.skills.map((s) => registrySkillToCatalogSkill(s, _registryData!));
  return FALLBACK_CATALOG;
}

/**
 * Get domain priority. Uses registry if loaded, fallback otherwise.
 */
export function getDomainPriority(domainId: string): 'core' | 'extended' | 'reference' | undefined {
  if (_registryData) {
    const domain = _registryData.domains.find((d) => d.id === domainId);
    return domain?.priority;
  }
  return FALLBACK_PRIORITY[domainId];
}

// Backward-compatible exports — these delegate to the getter functions
// NOTE: These are evaluated at import time, so they return the fallback values.
// Code that needs registry data should use getDomains()/getCatalog() instead.
export const DOMAINS: SkillDomain[] = FALLBACK_DOMAINS;
export const CATALOG: CatalogSkill[] = FALLBACK_CATALOG;

export const DOMAIN_PRIORITY: Record<string, 'core' | 'extended' | 'reference'> = FALLBACK_PRIORITY;

// ── Collision Detection ──────────────────────────────

export function detectCollisions(): Collision[] {
  const catalog = getCatalog();
  const domains = getDomains();

  const domainMap = new Map<string, CatalogSkill[]>();
  for (const skill of catalog) {
    for (const domainId of skill.domains) {
      const list = domainMap.get(domainId) ?? [];
      list.push(skill);
      domainMap.set(domainId, list);
    }
  }

  const collisions: Collision[] = [];
  for (const [domainId, skills] of domainMap) {
    const repos = new Set(skills.map((s) => s.repo));
    if (repos.size < 2) continue;
    const domain = domains.find((d) => d.id === domainId);
    if (!domain) continue;
    const unique = [...new Map(skills.map((s) => [s.id, s])).values()];
    collisions.push({ domain, skills: unique });
  }

  return collisions;
}

// ── Catalog Search ───────────────────────────────────

export function searchCatalog(query: {
  domain?: string;
  repo?: string;
  text?: string;
}): CatalogSkill[] {
  let results = [...getCatalog()];

  if (query.domain) {
    results = results.filter((s) => s.domains.includes(query.domain!));
  }
  if (query.repo) {
    results = results.filter((s) => s.repo === query.repo);
  }
  if (query.text) {
    const lower = query.text.toLowerCase();
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.id.toLowerCase().includes(lower),
    );
  }

  return results;
}

// ── Built-in Profiles ────────────────────────────────

export function getBuiltInProfiles(): SkillProfile[] {
  if (_registryData) return _registryData.profiles.map(registryProfileToSkillProfile);
  return [
    {
      name: "ecc-first",
      description: "ECC wins all collisions",
      resolutions: [
        { domain_id: "tdd", chosen_skill_id: "ecc/tdd-workflow" },
        { domain_id: "planning", chosen_skill_id: "ecc/plan" },
        { domain_id: "code-review", chosen_skill_id: "ecc/go-review" },
        { domain_id: "verification", chosen_skill_id: "ecc/verification-loop" },
        { domain_id: "agent-orchestration", chosen_skill_id: "ecc/autonomous-loops" },
        { domain_id: "security", chosen_skill_id: "ecc/security-review" },
        { domain_id: "shipping", chosen_skill_id: "ecc/deployment-patterns" },
        { domain_id: "debugging", chosen_skill_id: "superpowers/systematic-debugging" },
        { domain_id: "brainstorming", chosen_skill_id: "superpowers/brainstorming" },
        { domain_id: "frontend-design", chosen_skill_id: "anthropics/frontend-design" },
      ],
    },
  ];
}

// Legacy export — uses getter
export const BUILT_IN_PROFILES: SkillProfile[] = [];

export function getProfile(name: string): SkillProfile | undefined {
  return getBuiltInProfiles().find((p) => p.name === name);
}
