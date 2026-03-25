// SPDX-License-Identifier: AGPL-3.0-or-later
import { VaultFS } from "../../lib/vault-fs.js";
import { SkillRegistryManager } from "../../lib/skill-registry.js";
import { installSkill, deleteSkill, InstallResult } from "./install.js";
import { listSkills, ListResult } from "./list.js";
import { validateSkill, ValidateResult } from "./validate.js";
import {
  catalogCommand,
  collisionsCommand,
  resolveCommand,
  generateCommand,
  type CatalogResult,
  type CollisionResult,
  type ResolveResult,
  type GenerateResult,
} from "./marketplace.js";

export interface SkillCommandOptions {
  action: 'install' | 'list' | 'validate' | 'delete' | 'catalog' | 'collisions' | 'resolve' | 'generate';
  source?: string;
  skillPath?: string;
  skillName?: string;
  force?: boolean;
  // Marketplace options
  domain?: string;
  repo?: string;
  search?: string;
  profile?: string;
  includeNonColliding?: boolean;
  outputPath?: string;
  pipe?: boolean;
  pipeLayer?: 'core' | 'extended' | 'reference' | 'all';
  relevantDomains?: string[];
}

export type SkillCommandResult =
  | { action: 'install'; result: InstallResult }
  | { action: 'list'; result: ListResult }
  | { action: 'validate'; result: ValidateResult }
  | { action: 'delete'; result: InstallResult }
  | { action: 'catalog'; result: CatalogResult }
  | { action: 'collisions'; result: CollisionResult }
  | { action: 'resolve'; result: ResolveResult }
  | { action: 'generate'; result: GenerateResult };

export async function skillCommand(
  vaultFs: VaultFS,
  vaultPath: string,
  options: SkillCommandOptions
): Promise<SkillCommandResult> {
  const registryManager = new SkillRegistryManager(vaultPath);

  switch (options.action) {
    case 'install': {
      if (!options.source) {
        return {
          action: 'install',
          result: { success: false, error: 'Source is required for install action' },
        };
      }
      const result = await installSkill(vaultFs, registryManager, {
        source: options.source,
        force: options.force,
      });
      return { action: 'install', result };
    }

    case 'list': {
      const result = await listSkills(registryManager);
      return { action: 'list', result };
    }

    case 'validate': {
      if (!options.skillPath) {
        return {
          action: 'validate',
          result: { valid: false, errors: ['Skill path is required for validate action'] },
        };
      }
      const result = await validateSkill({ skillPath: options.skillPath });
      return { action: 'validate', result };
    }

    case 'delete': {
      if (!options.skillName) {
        return {
          action: 'delete',
          result: { success: false, error: 'Skill name is required for delete action' },
        };
      }
      const result = await deleteSkill(vaultFs, registryManager, options.skillName);
      return { action: 'delete', result };
    }

    case 'catalog': {
      const result = await catalogCommand({
        domain: options.domain,
        repo: options.repo,
        search: options.search,
      });
      return { action: 'catalog', result };
    }

    case 'collisions': {
      const result = await collisionsCommand();
      return { action: 'collisions', result };
    }

    case 'resolve': {
      const result = await resolveCommand({ profile: options.profile });
      return { action: 'resolve', result };
    }

    case 'generate': {
      const result = await generateCommand(vaultFs, vaultPath, {
        profile: options.profile,
        includeNonColliding: options.includeNonColliding,
        outputPath: options.outputPath,
        pipe: options.pipe,
        pipeLayer: options.pipeLayer,
        relevantDomains: options.relevantDomains,
      });
      return { action: 'generate', result };
    }
  }
}

export { installSkill, deleteSkill } from "./install.js";
export { listSkills } from "./list.js";
export { validateSkill } from "./validate.js";
export { SkillRegistryManager } from "../../lib/skill-registry.js";
export * from "./schema.js";
export * from "./catalog.js";
export { catalogCommand, collisionsCommand, resolveCommand, generateCommand } from "./marketplace.js";
export type { CatalogResult, CollisionResult, ResolveResult, GenerateResult } from "./marketplace.js";
