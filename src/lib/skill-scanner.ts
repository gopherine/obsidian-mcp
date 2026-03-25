// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Skill Scanner — discovers installed SKILL.md files from the Agent Skills ecosystem.
 *
 * Scans standard skill directories for each AI tool:
 * - ~/.claude/skills/ (global Claude Code skills)
 * - .claude/skills/ (project-level Claude Code skills)
 * - ~/.cursor/skills/, etc.
 *
 * Parses SKILL.md frontmatter (Agent Skills standard) and builds a runtime
 * index that the trigger matcher can score against.
 */

import { readFile, readdir, stat } from "fs/promises";
import { resolve, join, basename, dirname } from "path";
import { homedir } from "os";
import matter from "gray-matter";
import { extractKeywords } from "./text-utils.js";

// ── Types ──────────────────────────────────────────

export interface ScannedSkill {
  /** Skill name from frontmatter */
  name: string;
  /** Description from frontmatter */
  description: string;
  /** Absolute path to the SKILL.md file */
  path: string;
  /** Directory containing the SKILL.md */
  dir: string;
  /** Whether this is a project-level or global skill */
  scope: "global" | "project";
  /** Source tool directory (e.g., "claude", "cursor") */
  source_tool: string;
  /** Version from frontmatter metadata */
  version?: string;
  /** Tags from frontmatter */
  tags?: string[];
  /** Auto-generated trigger keywords from name + description */
  triggers: string[];
  /** Raw frontmatter data */
  frontmatter: Record<string, unknown>;
}

export interface ScanResult {
  skills: ScannedSkill[];
  scan_paths: string[];
  errors: string[];
}

// ── Skill Directory Paths ──────────────────────────

interface SkillDir {
  path: string;
  scope: "global" | "project";
  source_tool: string;
}

/**
 * Get all standard skill directories to scan.
 * Includes both global (home dir) and project-level paths.
 */
export function getSkillDirectories(projectDir?: string): SkillDir[] {
  const home = homedir();
  const dirs: SkillDir[] = [
    // Global skill directories
    { path: resolve(home, ".claude", "skills"), scope: "global", source_tool: "claude" },
    { path: resolve(home, ".cursor", "skills"), scope: "global", source_tool: "cursor" },
    { path: resolve(home, ".codex", "skills"), scope: "global", source_tool: "codex" },
    { path: resolve(home, ".gemini", "skills"), scope: "global", source_tool: "gemini" },
    { path: resolve(home, ".config", "opencode", "skills"), scope: "global", source_tool: "opencode" },
  ];

  // Project-level skill directories
  if (projectDir) {
    dirs.push(
      { path: resolve(projectDir, ".claude", "skills"), scope: "project", source_tool: "claude" },
      { path: resolve(projectDir, ".cursor", "skills"), scope: "project", source_tool: "cursor" },
      { path: resolve(projectDir, ".agents", "skills"), scope: "project", source_tool: "generic" },
    );
  }

  return dirs;
}

// Allow tests to override scan paths
let _overrideDirs: SkillDir[] | null = null;
export function _setSkillDirectories(dirs: SkillDir[]): void { _overrideDirs = dirs; }
export function _resetSkillDirectories(): void { _overrideDirs = null; }

// ── Scanning ───────────────────────────────────────

/**
 * Recursively find all SKILL.md files under a directory.
 */
async function findSkillFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden dirs except .claude, .agents
        if (entry.name.startsWith(".") && entry.name !== ".claude" && entry.name !== ".agents") continue;
        // Skip node_modules, dist, etc.
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const nested = await findSkillFiles(fullPath);
        results.push(...nested);
      } else if (entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return results;
}

/**
 * Parse a SKILL.md file into a ScannedSkill.
 */
function parseSkillFile(
  content: string,
  filePath: string,
  scope: "global" | "project",
  sourceTool: string,
): ScannedSkill | null {
  try {
    const { data, content: body } = matter(content);

    const name = typeof data.name === "string" ? data.name : "";
    const description = typeof data.description === "string" ? data.description : "";

    if (!name || !description) return null;

    // Extract version from metadata or top-level
    const version =
      typeof data.version === "string" ? data.version :
      (data.metadata && typeof data.metadata === "object" && "version" in data.metadata)
        ? String((data.metadata as Record<string, unknown>).version)
        : undefined;

    // Extract tags
    const tags = Array.isArray(data.tags) ? data.tags.filter((t: unknown) => typeof t === "string") : undefined;

    // Auto-generate triggers from name + description
    const triggerSource = `${name} ${description}`;
    const triggers = extractKeywords(triggerSource);

    return {
      name,
      description,
      path: filePath,
      dir: dirname(filePath),
      scope,
      source_tool: sourceTool,
      version,
      tags,
      triggers,
      frontmatter: data,
    };
  } catch {
    return null;
  }
}

/**
 * Scan all standard skill directories and return discovered skills.
 */
export async function scanInstalledSkills(projectDir?: string): Promise<ScanResult> {
  const dirs = _overrideDirs ?? getSkillDirectories(projectDir);
  const skills: ScannedSkill[] = [];
  const scanPaths: string[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (const dir of dirs) {
    scanPaths.push(dir.path);

    const skillFiles = await findSkillFiles(dir.path);
    for (const filePath of skillFiles) {
      try {
        const content = await readFile(filePath, "utf-8");
        const skill = parseSkillFile(content, filePath, dir.scope, dir.source_tool);
        if (skill) {
          // Deduplicate by name — project skills override global
          if (seenNames.has(skill.name)) {
            if (skill.scope === "project") {
              // Replace the global one
              const idx = skills.findIndex((s) => s.name === skill.name);
              if (idx >= 0) skills[idx] = skill;
            }
            // Skip if global and we already have it
            continue;
          }
          seenNames.add(skill.name);
          skills.push(skill);
        }
      } catch (err) {
        errors.push(`${filePath}: ${(err as Error).message}`);
      }
    }
  }

  return { skills, scan_paths: scanPaths, errors };
}

/**
 * Convert scanned skills to registry-compatible format for trigger matching.
 * This bridges the gap between the Agent Skills standard and SuperSkill's
 * existing trigger matcher.
 */
export function scannedSkillsToRegistryFormat(scanned: ScannedSkill[]): Array<{
  id: string;
  name: string;
  source: string;
  path: string;
  domains: string[];
  description: string;
  triggers: string[];
  version: string;
}> {
  return scanned.map((s) => ({
    id: `local/${s.name}`,
    name: s.name,
    source: "local",
    path: s.path,
    domains: [], // Local skills don't have domain assignments yet
    description: s.description,
    triggers: s.triggers,
    version: s.version ?? "local",
  }));
}
