// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, mkdir, rm } from "fs/promises";
import { dirname, basename } from "path";
import { VaultFS } from "../../lib/vault-fs.js";
import { SkillRegistryManager } from "../../lib/skill-registry.js";
import { SkillFrontmatter, InstalledSkill, isSkillFrontmatter } from "./schema.js";
import { parseFrontmatter } from "../../lib/frontmatter.js";

export interface InstallOptions {
  source: string;
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  skill?: InstalledSkill;
  error?: string;
}

async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

async function readSkillContent(source: string): Promise<{ content: string; sourceType: 'file' | 'url' }> {
  if (isUrl(source)) {
    const content = await fetchUrl(source);
    return { content, sourceType: 'url' };
  }
  
  const content = await readFile(source, "utf-8");
  return { content, sourceType: 'file' };
}

export async function installSkill(
  vaultFs: VaultFS,
  registryManager: SkillRegistryManager,
  options: InstallOptions
): Promise<InstallResult> {
  const { source, force = false } = options;
  
  let skillContent: string;
  let sourceType: 'file' | 'url';
  
  try {
    const result = await readSkillContent(source);
    skillContent = result.content;
    sourceType = result.sourceType;
  } catch (e: unknown) {
    return {
      success: false,
      error: `Failed to read source: ${(e as Error).message}`,
    };
  }
  
  const { data } = parseFrontmatter(skillContent);
  
  if (!isSkillFrontmatter(data)) {
    return {
      success: false,
      error: "Invalid skill frontmatter: missing required fields (name, description)",
    };
  }
  
  const skillData = data as SkillFrontmatter;
  const skillName = skillData.name;
  
  const existing = await registryManager.get(skillName);
  if (existing && !force) {
    return {
      success: false,
      error: `Skill "${skillName}" already installed. Use --force to overwrite.`,
    };
  }
  
  const installedPath = registryManager.getInstalledPath(skillName);
  const relativePath = `skills/installed/${skillName}/SKILL.md`;
  
  try {
    await vaultFs.write(relativePath, skillContent);
  } catch (e: unknown) {
    return {
      success: false,
      error: `Failed to write skill file: ${(e as Error).message}`,
    };
  }
  
  const now = new Date().toISOString();
  const installedSkill: InstalledSkill = {
    name: skillName,
    source: sourceType === 'url' ? source : 'local',
    source_path: sourceType === 'file' ? source : undefined,
    version: skillData.version ?? '0.0.0',
    installed_at: existing?.installed_at ?? now,
    updated_at: now,
    status: 'active',
    auto_update: sourceType === 'url',
    depends_on: skillData.depends_on,
  };
  
  await registryManager.add(installedSkill);
  
  return {
    success: true,
    skill: installedSkill,
  };
}

export async function deleteSkill(
  vaultFs: VaultFS,
  registryManager: SkillRegistryManager,
  skillName: string
): Promise<InstallResult> {
  const existing = await registryManager.get(skillName);
  if (!existing) {
    return {
      success: false,
      error: `Skill "${skillName}" not found in registry.`,
    };
  }
  
  const skillDir = `skills/installed/${skillName}`;
  
  try {
    if (await vaultFs.exists(skillDir)) {
      const absolutePath = dirname(registryManager.getInstalledPath(skillName));
      await rm(absolutePath, { recursive: true, force: true });
    }
  } catch (e: unknown) {
    console.error("[skill] Error removing skill directory:", (e as Error).message);
  }
  
  await registryManager.remove(skillName);
  
  return {
    success: true,
    skill: existing,
  };
}
