import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export function readJsonConfig(filePath: string): Record<string, any> | null {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJsonConfig(filePath: string, config: Record<string, any>): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (existsSync(filePath)) {
    copyFileSync(filePath, `${filePath}.bak.obsidian-mcp`);
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function addMcpEntry(
  config: Record<string, any>,
  rootKey: string,
  serverName: string,
  entry: Record<string, any>,
  force = false
): { config: Record<string, any>; alreadyExists: boolean } {
  const result = { ...config };
  if (!result[rootKey]) result[rootKey] = {};

  if (result[rootKey][serverName] && !force) {
    return { config: result, alreadyExists: true };
  }

  result[rootKey] = { ...result[rootKey], [serverName]: entry };
  return { config: result, alreadyExists: false };
}

export function removeMcpEntry(
  config: Record<string, any>,
  rootKey: string,
  serverName: string
): { config: Record<string, any>; removed: boolean } {
  if (!config[rootKey] || !config[rootKey][serverName]) {
    return { config, removed: false };
  }
  const result = { ...config, [rootKey]: { ...config[rootKey] } };
  delete result[rootKey][serverName];
  return { config: result, removed: true };
}
