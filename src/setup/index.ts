// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Command } from "commander";
import { CLIENT_REGISTRY } from "./clients.js";
import { detectClients } from "./detect.js";
import { configureClient } from "./configure.js";
import { teardownAll } from "./teardown.js";
import type { DetectedClient } from "./types.js";
import { resolveHome, currentPlatform } from "./types.js";

export function registerSetupCommands(program: Command): void {
  program
    .command("setup")
    .description("Auto-configure AI clients to use superskill as knowledge base")
    .option("--all", "Configure all supported clients (even undetected)")
    .option("--clients <list>", "Comma-separated client slugs")
    .option("--dry-run", "Show what would change without writing")
    .option("--force", "Overwrite existing superskill entries")
    .option("--vault-path <path>", "Override vault path")
    .action(async (opts: { all?: boolean; clients?: string; dryRun?: boolean; force?: boolean; vaultPath?: string }) => {
      const vaultPath = opts.vaultPath ?? process.env.VAULT_PATH ?? "~/Vaults/ai";
      const clientSlugs = opts.clients?.split(",").map((s) => s.trim());

      console.log("\nScanning for AI clients...\n");
      const detected = detectClients();
      const detectedSlugs = new Set(detected.map((d) => d.config.slug));

      for (const client of CLIENT_REGISTRY) {
        const found = detectedSlugs.has(client.slug);
        const mark = found ? "+" : "-";
        const suffix = found ? "" : " (not found)";
        console.log(`  ${mark} ${client.name.padEnd(18)}${suffix}`);
      }

      // Determine targets
      let targets: DetectedClient[];
      if (clientSlugs) {
        targets = [];
        for (const slug of clientSlugs) {
          const existing = detected.find((d) => d.config.slug === slug);
          if (existing) {
            targets.push(existing);
          } else {
            const cfg = CLIENT_REGISTRY.find((c) => c.slug === slug);
            if (cfg) {
              const plat = currentPlatform();
              targets.push({
                config: cfg,
                mcpConfigPath: resolveHome(cfg.mcpConfigPaths[plat]),
                instructionPath: cfg.instructionPaths
                  ? resolveHome(cfg.instructionPaths[plat])
                  : undefined,
              });
            }
          }
        }
      } else if (opts.all) {
        const plat = currentPlatform();
        targets = CLIENT_REGISTRY.map((cfg) => ({
          config: cfg,
          mcpConfigPath: resolveHome(cfg.mcpConfigPaths[plat]),
          instructionPath: cfg.instructionPaths
            ? resolveHome(cfg.instructionPaths[plat])
            : undefined,
        }));
      } else {
        targets = detected;
      }

      if (targets.length === 0) {
        console.log("\nNo clients to configure.");
        console.log('Run "superskill-cli setup --all" to configure all supported clients.\n');
        return;
      }

      console.log(`\n${opts.dryRun ? "Would configure" : "Configuring"}...\n`);
      let configured = 0;

      for (const target of targets) {
        const result = configureClient(target, vaultPath, {
          dryRun: opts.dryRun,
          force: opts.force,
        });

        console.log(`  ${result.client}`);
        if (result.error) {
          console.log(`    ! Error: ${result.error}`);
        } else {
          if (result.mcpConfigured) {
            console.log(`    + MCP server ${opts.dryRun ? "would be added to" : "added to"} ${target.mcpConfigPath}`);
          }
          if (result.skipped) {
            console.log(`    ~ ${result.skipped}`);
          }
          if (result.instructionConfigured) {
            const instrLabel = target.config.instructionStrategy === "mdc-file"
              ? "Rule written to"
              : "Instruction added to";
            console.log(`    + ${instrLabel} ${target.instructionPath ?? "config"}`);
          }
          if (target.config.instructionStrategy === "none") {
            console.log("    i No instruction mechanism — AI will discover tools automatically");
          }
          if (!target.config.verified) {
            console.log("    i Config format unverified — please check manually");
          }
          configured++;
        }
      }

      console.log(`\nDone! ${configured} client(s) configured.\n`);

      const targetSlugs = new Set(targets.map((t) => t.config.slug));
      const unconfigured = CLIENT_REGISTRY.filter((c) => !targetSlugs.has(c.slug));
      if (unconfigured.length > 0 && !opts.all) {
        console.log(`Not configured: ${unconfigured.map((c) => c.name).join(", ")}`);
        console.log('Run "superskill-cli setup --all" to configure them.\n');
      }
    });

  program
    .command("teardown")
    .description("Remove superskill configuration from AI clients")
    .option("--clients <list>", "Comma-separated client slugs")
    .option("--dry-run", "Show what would be removed")
    .option("--silent", "Suppress output")
    .action(async (opts: { clients?: string; dryRun?: boolean; silent?: boolean }) => {
      const clientSlugs = opts.clients?.split(",").map((s) => s.trim());
      const results = await teardownAll({
        clients: clientSlugs,
        dryRun: opts.dryRun,
        silent: opts.silent,
      });

      if (opts.silent) return;

      if (results.length === 0) {
        console.log("\nNothing to clean up.\n");
        return;
      }

      console.log("\nRemoving superskill configuration...\n");
      for (const r of results) {
        console.log(`  ${r.client}`);
        if (r.error) {
          console.log(`    ! Error: ${r.error}`);
        } else {
          if (r.mcpRemoved) console.log("    - MCP entry removed");
          if (r.instructionRemoved) console.log("    - Instruction removed");
          if (!r.mcpRemoved && !r.instructionRemoved) console.log("    ~ Nothing found");
        }
      }
      console.log("\nDone!\n");
    });
}
