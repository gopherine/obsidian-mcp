// SPDX-License-Identifier: AGPL-3.0-or-later
export interface DetectedTool {
  tool: 'claude-code' | 'opencode' | 'cursor' | 'codex' | 'gemini-cli' | 'unknown';
  model?: string;
  contextWindow?: number;
}

const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'o3': 200_000,
  'default': 128_000,
};

function lookupContextWindow(model: string | undefined): number {
  if (!model) return CONTEXT_WINDOWS['default'];
  // Exact match first
  if (model in CONTEXT_WINDOWS) return CONTEXT_WINDOWS[model];
  // Prefix / substring match
  for (const [key, value] of Object.entries(CONTEXT_WINDOWS)) {
    if (key === 'default') continue;
    if (model.startsWith(key) || key.startsWith(model)) return value;
  }
  return CONTEXT_WINDOWS['default'];
}

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function hasEnvPrefix(prefix: string): boolean {
  return Object.keys(process.env).some((k) => k.startsWith(prefix));
}

export function detectTool(): DetectedTool {
  // ── Claude Code ──────────────────────────────────────
  if (
    getEnv('CLAUDE_CODE') ||
    getEnv('CLAUDE_CODE_VAULT_PATH') ||
    getEnv('CLAUDE_CODE_WORKTREE') ||
    // Claude Code sets ANTHROPIC_MODEL or CLAUDE_MODEL when the AI invokes tools
    getEnv('CLAUDE_CODE_SESSION_ID') ||
    // The AGENTS.md system-reminder tells us we're in Claude Code when this var is present
    getEnv('CLAUDE_CODE_ENTRYPOINT')
  ) {
    const model =
      getEnv('CLAUDE_CODE_MODEL') ??
      getEnv('ANTHROPIC_MODEL') ??
      getEnv('CLAUDE_MODEL') ??
      undefined;
    return {
      tool: 'claude-code',
      model,
      contextWindow: lookupContextWindow(model),
    };
  }

  // ── OpenCode ─────────────────────────────────────────
  if (hasEnvPrefix('OPENCODE_')) {
    const model = getEnv('OPENCODE_MODEL') ?? undefined;
    return { tool: 'opencode', model, contextWindow: lookupContextWindow(model) };
  }

  // ── Cursor ───────────────────────────────────────────
  if (hasEnvPrefix('CURSOR_')) {
    const model = getEnv('CURSOR_MODEL') ?? undefined;
    return { tool: 'cursor', model, contextWindow: lookupContextWindow(model) };
  }

  // ── Codex ────────────────────────────────────────────
  if (hasEnvPrefix('CODEX_')) {
    const model = getEnv('CODEX_MODEL') ?? getEnv('OPENAI_MODEL') ?? undefined;
    return { tool: 'codex', model, contextWindow: lookupContextWindow(model) };
  }

  // ── Gemini CLI ───────────────────────────────────────
  if (hasEnvPrefix('GEMINI_')) {
    const model = getEnv('GEMINI_MODEL') ?? undefined;
    return { tool: 'gemini-cli', model, contextWindow: lookupContextWindow(model) };
  }

  // ── Unknown / fallback ───────────────────────────────
  return { tool: 'unknown', contextWindow: CONTEXT_WINDOWS['default'] };
}

export { CONTEXT_WINDOWS };
