import { existsSync } from "fs";
import { dirname } from "path";
import { homedir } from "os";
import { CLIENT_REGISTRY } from "./clients.js";
import type { ClientConfig, DetectedClient } from "./types.js";
import { resolveHome, currentPlatform } from "./types.js";

export function detectClient(client: ClientConfig): DetectedClient | null {
  const plat = currentPlatform();
  const mcpPath = resolveHome(client.mcpConfigPaths[plat]);

  const parentDir = dirname(mcpPath);
  const home = homedir();
  const parentIsHome = parentDir === home || parentDir === home + "/";

  if (!existsSync(mcpPath) && (parentIsHome || !existsSync(parentDir))) {
    return null;
  }

  const instructionPath = client.instructionPaths
    ? resolveHome(client.instructionPaths[plat])
    : undefined;

  return { config: client, mcpConfigPath: mcpPath, instructionPath };
}

export function detectClients(): DetectedClient[] {
  return CLIENT_REGISTRY.map(detectClient).filter(
    (d): d is DetectedClient => d !== null
  );
}
