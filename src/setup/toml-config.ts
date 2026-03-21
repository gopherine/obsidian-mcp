import { MARKER_START_TOML, MARKER_END_TOML } from "./types.js";

export function insertTomlBlock(
  content: string,
  block: string,
  force = false
): string | null {
  const hasBlock =
    content.includes(MARKER_START_TOML) && content.includes(MARKER_END_TOML);

  if (hasBlock && !force) return null;

  let base = content;
  if (hasBlock && force) {
    base = removeTomlBlock(content).content;
  }

  const trimmed = base.trimEnd();
  const separator = trimmed.length > 0 ? "\n\n" : "";
  return `${trimmed}${separator}${MARKER_START_TOML}\n${block}\n${MARKER_END_TOML}\n`;
}

export function removeTomlBlock(content: string): {
  content: string;
  removed: boolean;
} {
  const regex = new RegExp(
    `\\n?${escapeRegex(MARKER_START_TOML)}[\\s\\S]*?${escapeRegex(MARKER_END_TOML)}\\n?`,
    "g"
  );
  const result = content.replace(regex, "\n");
  return {
    content: result.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    removed: result !== content,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
