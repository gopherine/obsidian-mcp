// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  getCatalog,
  getDomains,
  detectCollisions,
  searchCatalog,
  getProfile,
  getBuiltInProfiles,
} from "./catalog.js";

// ── Result Types ─────────────────────────────────────

export interface CatalogResult {
  total: number;
  repos: { repo: string; count: number }[];
  domains: { id: string; name: string; skill_count: number }[];
  skills: import("./catalog.js").CatalogSkill[];
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
        name: getDomains().find((d) => d.id === id)?.name ?? id,
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
    const available = getBuiltInProfiles().map((p) => p.name).join(", ");
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
  for (const skill of getCatalog()) {
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
