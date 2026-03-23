// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
//
// Barrel re-export — this file preserves backward compatibility.
// All logic has been split into focused modules:
//   activate.ts  — activateSkills, matchTaskToDomains, TASK_DOMAIN_MAP, ActivateResult
//   resolve.ts   — resolveCommand, collisionsCommand, catalogCommand + result types
//   generate.ts  — generateCommand, LayerInfo, GenerateResult
//   manifest.ts  — generateManifest, loadSkillContent, getSkillAwarenessBlock + types
//   helpers.ts   — shared helpers (fetchSkillContent, formatSection, etc.)

export { catalogCommand, collisionsCommand, resolveCommand } from "./resolve.js";
export type { CatalogResult, CollisionResult, ResolveResult } from "./resolve.js";

export { generateCommand } from "./generate.js";
export type { LayerInfo, GenerateResult } from "./generate.js";

export { generateManifest, loadSkillContent, getSkillAwarenessBlock } from "./manifest.js";
export type { ManifestEntry, ManifestResult } from "./manifest.js";

export { activateSkills, matchTaskToDomains, TASK_DOMAIN_MAP } from "./activate.js";
export type { ActivateResult } from "./activate.js";
