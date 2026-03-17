/**
 * Rough token estimation using chars/4 heuristic.
 * Known inaccuracy: code-heavy content with short tokens (brackets, operators)
 * may undercount by 20-30%. We add a 15% safety margin.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4 * 1.15);
}

/**
 * Truncate text to fit within a token budget.
 * Truncates at the last section boundary (## heading) before the limit.
 * Falls back to the last paragraph boundary, then last newline.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) {
    return { text, truncated: false };
  }

  // Reserve ~20 tokens for the truncation suffix indicator
  const reservedTokens = 20;
  const effectiveBudget = Math.max(0, maxTokens - reservedTokens);

  // Convert token budget to approximate character limit
  const charLimit = Math.floor(effectiveBudget / 1.15 * 4);

  // Try to cut at a section boundary
  const truncated = text.slice(0, charLimit);
  const lastSection = truncated.lastIndexOf("\n## ");
  if (lastSection > charLimit * 0.5) {
    return {
      text: truncated.slice(0, lastSection) + "\n\n[truncated — use vault_project_context for full details]",
      truncated: true,
    };
  }

  // Fall back to paragraph boundary
  const lastParagraph = truncated.lastIndexOf("\n\n");
  if (lastParagraph > charLimit * 0.3) {
    return {
      text: truncated.slice(0, lastParagraph) + "\n\n[truncated — use vault_project_context for full details]",
      truncated: true,
    };
  }

  // Fall back to last newline
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > 0) {
    return {
      text: truncated.slice(0, lastNewline) + "\n\n[truncated — use vault_project_context for full details]",
      truncated: true,
    };
  }

  return {
    text: truncated + "\n\n[truncated — use vault_project_context for full details]",
    truncated: true,
  };
}
