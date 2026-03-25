#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
try {
  const { teardownAll } = await import("./teardown.js");
  await teardownAll({ silent: true });
} catch {
  // never block uninstall
}
process.exit(0);
