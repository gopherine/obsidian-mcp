// SPDX-License-Identifier: AGPL-3.0-or-later
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  depends_on?: string[];
}

export interface InstalledSkill {
  name: string;
  source: string;
  source_path?: string;
  version: string;
  installed_at: string;
  updated_at: string;
  status: 'active' | 'deprecated';
  auto_update: boolean;
  depends_on?: string[];
}

export interface SkillRegistry {
  skills: InstalledSkill[];
}

const REQUIRED_FIELDS: (keyof SkillFrontmatter)[] = ['name', 'description'];

export function isSkillFrontmatter(data: unknown): data is SkillFrontmatter {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  for (const field of REQUIRED_FIELDS) {
    if (typeof obj[field] !== 'string') {
      return false;
    }
  }
  
  if (obj.version !== undefined && typeof obj.version !== 'string') {
    return false;
  }
  
  if (obj.author !== undefined && typeof obj.author !== 'string') {
    return false;
  }
  
  if (obj.tags !== undefined && !isStringArray(obj.tags)) {
    return false;
  }
  
  if (obj.depends_on !== undefined && !isStringArray(obj.depends_on)) {
    return false;
  }
  
  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function validateSkillFrontmatter(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Frontmatter must be an object'] };
  }
  
  const obj = data as Record<string, unknown>;
  
  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    errors.push('Missing or invalid required field: name');
  }
  
  if (typeof obj.description !== 'string' || obj.description.trim() === '') {
    errors.push('Missing or invalid required field: description');
  }
  
  if (obj.version !== undefined && typeof obj.version !== 'string') {
    errors.push('Field "version" must be a string');
  }
  
  if (obj.author !== undefined && typeof obj.author !== 'string') {
    errors.push('Field "author" must be a string');
  }
  
  if (obj.tags !== undefined && !isStringArray(obj.tags)) {
    errors.push('Field "tags" must be an array of strings');
  }
  
  if (obj.depends_on !== undefined && !isStringArray(obj.depends_on)) {
    errors.push('Field "depends_on" must be an array of strings');
  }
  
  return { valid: errors.length === 0, errors };
}
