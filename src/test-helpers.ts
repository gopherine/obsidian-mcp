// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { vi } from "vitest";
import { VaultFS } from "./lib/vault-fs.js";
import { SessionRegistryManager } from "./lib/session-registry.js";
import type { CommandContext, Logger } from "./core/types.js";

export async function createTestVault(options?: {
  project?: string;
  setupProject?: boolean;
}): Promise<{ vaultRoot: string; vaultFs: VaultFS; cleanup: () => Promise<void> }> {
  const vaultRoot = join(
    tmpdir(),
    `.vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(vaultRoot, { recursive: true });

  const vaultFs = new VaultFS(vaultRoot);

  if (options?.project || options?.setupProject) {
    const slug = options?.project ?? "test-project";
    const projectMap = { projects: { [slug]: "/tmp/test" } };
    await vaultFs.write("project-map.json", JSON.stringify(projectMap, null, 2));
    await mkdir(join(vaultRoot, `projects/${slug}`), { recursive: true });
  }

  const cleanup = async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  };

  return { vaultRoot, vaultFs, cleanup };
}

export function createCommandContext(
  vaultFs: VaultFS,
  overrides?: Partial<CommandContext>
): CommandContext {
  return {
    vaultFs,
    vaultPath: vaultFs.root,
    sessionRegistry: new SessionRegistryManager(vaultFs.root, 2) as unknown as CommandContext["sessionRegistry"],
    config: {
      vaultPath: vaultFs.root,
      maxInjectTokens: 1500,
      sessionTtlHours: 2,
    },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger,
    ...overrides,
  };
}

export async function createTestContext(options?: {
  project?: string;
  setupProject?: boolean;
}): Promise<{
  vaultRoot: string;
  vaultFs: VaultFS;
  ctx: CommandContext;
  cleanup: () => Promise<void>;
}> {
  const { vaultRoot, vaultFs, cleanup } = await createTestVault(options);
  const ctx = createCommandContext(vaultFs);
  return { vaultRoot, vaultFs, ctx, cleanup };
}
