// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from "fs/promises";
import { parseFrontmatter } from "../../lib/frontmatter.js";
import { validateSkillFrontmatter, SkillFrontmatter } from "./schema.js";

export interface ValidateOptions {
  skillPath: string;
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
  frontmatter?: SkillFrontmatter;
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

export async function validateSkill(
  options: ValidateOptions
): Promise<ValidateResult> {
  const { skillPath } = options;
  
  let content: string;
  try {
    if (isUrl(skillPath)) {
      content = await fetchUrl(skillPath);
    } else {
      content = await readFile(skillPath, "utf-8");
    }
  } catch (e: unknown) {
    return {
      valid: false,
      errors: [`Failed to read file: ${(e as Error).message}`],
    };
  }
  
  const { data } = parseFrontmatter(content);
  const { valid, errors } = validateSkillFrontmatter(data);
  
  return {
    valid,
    errors,
    frontmatter: valid ? data as unknown as SkillFrontmatter : undefined,
  };
}
