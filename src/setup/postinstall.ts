#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
try {
  const { detectClients } = await import("./detect.js");
  const { prefetchCoreSkills, PREFETCH_SKILL_IDS } = await import("../lib/skill-cache.js");

  if (!process.stdout.isTTY) process.exit(0);

  const detected = detectClients();

  console.log("\n  superskill installed!\n");

  if (detected.length > 0) {
    console.log(`  Detected: ${detected.map((c) => c.config.name).join(", ")}`);
    console.log('  Run "superskill-cli setup" to auto-configure them as your knowledge base.');
  } else {
    console.log("  No AI clients detected.");
  }

  console.log('  Run "superskill-cli setup --all" to configure all 8 supported clients.\n');

  // Prefetch core skills for offline availability
  console.log(`  Prefetching ${PREFETCH_SKILL_IDS.length} core skills...`);

  const result = await prefetchCoreSkills({
    onProgress: (skill, status) => {
      const icon = status === "fetched" ? "+" : status === "cached" ? "=" : "x";
      console.log(`    [${icon}] ${skill}`);
    },
  });

  const parts: string[] = [];
  if (result.fetched > 0) parts.push(`${result.fetched} fetched`);
  if (result.cached > 0) parts.push(`${result.cached} already cached`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  console.log(`  Done: ${parts.join(", ")}.\n`);

  if (result.failed > 0) {
    console.log("  Some skills could not be prefetched. They will be fetched on first use.\n");
  }
} catch {
  // Postinstall must never fail the install
  process.exit(0);
}
