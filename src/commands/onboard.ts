// SPDX-License-Identifier: AGPL-3.0-or-later

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { detectClients } from "../setup/detect.js";
import { configureClient } from "../setup/configure.js";
import { scanInstalledSkills } from "../lib/skill-scanner.js";

export interface OnboardResult {
  vaultPath: string;
  detectedClients: string[];
  configuredClients: string[];
  installedSkills: number;
  errors: string[];
}

/**
 * Non-interactive onboarding — detects tools, configures them, scans skills.
 * Designed for CLI use where interactive prompts aren't practical.
 */
export async function onboard(options?: {
  vaultPath?: string;
}): Promise<OnboardResult> {
  const errors: string[] = [];

  // 1. Determine vault path
  const vaultPath = options?.vaultPath ?? join(homedir(), "Vaults", "ai");
  if (!existsSync(vaultPath)) {
    mkdirSync(vaultPath, { recursive: true });
  }

  // 2. Detect installed AI tools
  const detected = detectClients();
  const detectedNames = detected.map(d => d.config.name);

  // 3. Configure each detected tool
  const configuredClients: string[] = [];
  for (const client of detected) {
    try {
      const result = configureClient(client, vaultPath);
      if (result.mcpConfigured || result.skipped) {
        configuredClients.push(client.config.name);
      }
      if (result.error) {
        errors.push(`${client.config.name}: ${result.error}`);
      }
    } catch (e) {
      errors.push(`${client.config.name}: ${(e as Error).message}`);
    }
  }

  // 4. Scan installed skills
  let installedSkills = 0;
  try {
    const scan = await scanInstalledSkills();
    installedSkills = scan.skills.length;
  } catch (e) {
    errors.push(`skill scan: ${(e as Error).message}`);
  }

  return {
    vaultPath,
    detectedClients: detectedNames,
    configuredClients,
    installedSkills,
    errors,
  };
}
