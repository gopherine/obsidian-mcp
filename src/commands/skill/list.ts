// SPDX-License-Identifier: AGPL-3.0-or-later
import { SkillRegistryManager } from "../../lib/skill-registry.js";
import { InstalledSkill } from "./schema.js";

export interface ListResult {
  skills: InstalledSkill[];
}

export async function listSkills(
  registryManager: SkillRegistryManager
): Promise<ListResult> {
  const skills = await registryManager.list();
  return { skills };
}
