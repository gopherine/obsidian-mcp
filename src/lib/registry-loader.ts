// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Registry Loader — loads the skill registry from disk or bundled fallback.
 *
 * Resolution order:
 * 1. User override (~/.superskill/registry/index.json) — if newer than bundled
 * 2. Bundled registry (registry/index.json in the npm package)
 *
 * The registry is loaded once and cached in memory for the process lifetime.
 */

import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

// ── Types ──────────────────────────────────────────

export interface RegistrySource {
  repo: string;
  base_url: string;
}

export interface RegistryDomain {
  id: string;
  name: string;
  description: string;
  priority: "core" | "extended" | "reference";
  triggers: string[];
}

export interface RegistrySkill {
  id: string;
  name: string;
  source: string;         // key in sources map
  path: string;           // relative path within source repo
  domains: string[];
  description: string;
  triggers: string[];
  version: string;
  tags?: string[];
}

export interface RegistryProfile {
  name: string;
  description: string;
  resolutions: Array<{ domain_id: string; chosen_skill_id: string }>;
}

export interface RegistryData {
  registry_version: string;
  generated_at: string;
  sources: Record<string, RegistrySource>;
  domains: RegistryDomain[];
  skills: RegistrySkill[];
  profiles: RegistryProfile[];
}

// ── Registry State ─────────────────────────────────

let _registry: RegistryData | null = null;
let _bundledPath: string | null = null;

/**
 * Resolve the path to the bundled registry file.
 * Works in both ESM and CJS contexts.
 */
function getBundledRegistryPath(): string {
  if (_bundledPath) return _bundledPath;
  // This file is at src/lib/registry-loader.ts → compiled to dist/lib/registry-loader.js
  // Registry is at registry/index.json (project root)
  const thisDir = dirname(fileURLToPath(import.meta.url));
  _bundledPath = resolve(thisDir, "..", "..", "registry", "index.json");
  return _bundledPath;
}

const USER_REGISTRY_PATH = resolve(homedir(), ".superskill", "registry", "index.json");

// Allow tests to override paths
let _userRegistryPath = USER_REGISTRY_PATH;
export function _setUserRegistryPath(p: string): void { _userRegistryPath = p; }
export function _resetUserRegistryPath(): void { _userRegistryPath = USER_REGISTRY_PATH; }
export function _setBundledRegistryPath(p: string): void { _bundledPath = p; }
export function _resetBundledRegistryPath(): void { _bundledPath = null; }

/**
 * Clear the cached registry. Used for testing.
 */
export function _clearRegistry(): void {
  _registry = null;
}

// ── Validation ─────────────────────────────────────

function isValidRegistry(data: unknown): data is RegistryData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.registry_version === "string" &&
    Array.isArray(d.domains) &&
    Array.isArray(d.skills) &&
    Array.isArray(d.profiles) &&
    d.domains.length > 0 &&
    d.skills.length > 0
  );
}

// ── Loading ────────────────────────────────────────

async function loadFromFile(path: string): Promise<RegistryData | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (isValidRegistry(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Load the registry. Tries user override first, falls back to bundled.
 * The result is cached in memory — call _clearRegistry() in tests.
 */
export async function loadRegistry(): Promise<RegistryData> {
  if (_registry) return _registry;

  // Try user override first
  const userRegistry = await loadFromFile(_userRegistryPath);
  if (userRegistry) {
    _registry = userRegistry;
    return _registry;
  }

  // Fall back to bundled
  const bundledRegistry = await loadFromFile(getBundledRegistryPath());
  if (bundledRegistry) {
    _registry = bundledRegistry;
    return _registry;
  }

  throw new Error("Failed to load skill registry: no valid registry found");
}

/**
 * Get the cached registry. Throws if not yet loaded.
 * For synchronous access after loadRegistry() has been called.
 */
export function getRegistry(): RegistryData {
  if (!_registry) {
    throw new Error("Registry not loaded. Call loadRegistry() first.");
  }
  return _registry;
}

/**
 * Get the full source URL for a skill.
 */
export function getSkillSourceUrl(skill: RegistrySkill, registry: RegistryData): string {
  const source = registry.sources[skill.source];
  if (!source) throw new Error(`Unknown source "${skill.source}" for skill "${skill.id}"`);
  return `${source.base_url}/${skill.path}`;
}

/**
 * Get all domain names as a formatted string for tool descriptions.
 */
export function getDomainSummary(registry: RegistryData): string {
  return registry.domains.map((d) => d.name).join(", ");
}

/**
 * Merge locally scanned skills into the registry.
 * Local skills are added with source "local" and don't replace existing skills.
 */
export function mergeLocalSkills(
  registry: RegistryData,
  localSkills: RegistrySkill[],
): RegistryData {
  const existingIds = new Set(registry.skills.map((s) => s.id));

  // Add "local" source if not present
  const sources = { ...registry.sources };
  if (!sources.local) {
    sources.local = { repo: "local", base_url: "" };
  }

  // Only add skills that aren't already in the registry
  const newSkills = localSkills.filter((s) => !existingIds.has(s.id));

  return {
    ...registry,
    sources,
    skills: [...registry.skills, ...newSkills],
  };
}
