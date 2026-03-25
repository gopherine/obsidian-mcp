// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Escape a string for use in a regex pattern.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
