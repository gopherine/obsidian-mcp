// SPDX-License-Identifier: AGPL-3.0-or-later

import { detectTool } from "./tool-detector.js";
import { estimateTokens } from "./token-estimator.js";

/** Max fraction of context window to allocate to skills (15%) */
const SKILL_BUDGET_RATIO = 0.15;
const MIN_BUDGET_TOKENS = 2_000;
const MAX_BUDGET_TOKENS = 50_000;

export interface BudgetResult {
  totalBudget: number;
  contextWindow: number;
  model?: string;
}

export function getSkillBudget(): BudgetResult {
  const detected = detectTool();
  const contextWindow = detected.contextWindow ?? 128_000;
  const raw = Math.floor(contextWindow * SKILL_BUDGET_RATIO);
  const totalBudget = Math.max(MIN_BUDGET_TOKENS, Math.min(MAX_BUDGET_TOKENS, raw));
  return { totalBudget, contextWindow, model: detected.model };
}

/**
 * Given a list of skill contents ordered by priority, return as many as fit
 * within the token budget. Returns indices of skills that fit.
 */
export function fitSkillsToBudget(
  contents: string[],
  budget: number
): { included: number[]; excluded: number[]; usedTokens: number } {
  const included: number[] = [];
  const excluded: number[] = [];
  let usedTokens = 0;

  for (let i = 0; i < contents.length; i++) {
    const tokens = estimateTokens(contents[i]);
    if (usedTokens + tokens <= budget) {
      included.push(i);
      usedTokens += tokens;
    } else {
      // Once budget is exceeded, all remaining skills are excluded (priority order)
      for (let j = i; j < contents.length; j++) {
        excluded.push(j);
      }
      break;
    }
  }

  return { included, excluded, usedTokens };
}
