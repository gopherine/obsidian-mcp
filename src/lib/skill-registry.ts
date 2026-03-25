// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { SkillRegistry, InstalledSkill } from "../commands/skill/schema.js";

export class SkillRegistryManager {
  private readonly registryPath: string;
  private readonly installedDir: string;

  constructor(vaultPath: string) {
    this.registryPath = resolve(vaultPath, "skills/registry.json");
    this.installedDir = resolve(vaultPath, "skills/installed");
  }

  async read(): Promise<SkillRegistry> {
    try {
      const raw = await readFile(this.registryPath, "utf-8");
      const parsed = JSON.parse(raw);

      if (!parsed || !Array.isArray(parsed.skills)) {
        return { skills: [] };
      }

      const validSkills = parsed.skills.filter(
        (s: unknown): s is InstalledSkill => {
          if (typeof s !== 'object' || s === null) return false;
          const obj = s as Record<string, unknown>;
          return (
            typeof obj.name === 'string' &&
            typeof obj.source === 'string' &&
            typeof obj.version === 'string' &&
            typeof obj.installed_at === 'string' &&
            typeof obj.updated_at === 'string' &&
            typeof obj.status === 'string' &&
            (obj.status === 'active' || obj.status === 'deprecated') &&
            typeof obj.auto_update === 'boolean'
          );
        }
      );

      return { skills: validSkills };
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[skill-registry] Error reading registry:", (e as Error).message);
      }
      return { skills: [] };
    }
  }

  async write(registry: SkillRegistry): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true });
    await writeFile(this.registryPath, JSON.stringify(registry, null, 2), "utf-8");
  }

  async add(skill: InstalledSkill): Promise<void> {
    const registry = await this.read();
    const existingIndex = registry.skills.findIndex(s => s.name === skill.name);
    
    if (existingIndex >= 0) {
      registry.skills[existingIndex] = skill;
    } else {
      registry.skills.push(skill);
    }
    
    await this.write(registry);
  }

  async remove(name: string): Promise<boolean> {
    const registry = await this.read();
    const index = registry.skills.findIndex(s => s.name === name);
    
    if (index < 0) {
      return false;
    }
    
    registry.skills.splice(index, 1);
    await this.write(registry);
    return true;
  }

  async get(name: string): Promise<InstalledSkill | undefined> {
    const registry = await this.read();
    return registry.skills.find(s => s.name === name);
  }

  async list(): Promise<InstalledSkill[]> {
    const registry = await this.read();
    return registry.skills;
  }

  getInstalledPath(skillName: string): string {
    return resolve(this.installedDir, skillName, "SKILL.md");
  }
}
