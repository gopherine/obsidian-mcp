#!/usr/bin/env bash
# Bootstrap hook for AI tool session start.
# Injects project context from the Obsidian vault into the session.
# Used by: Claude Code (SessionStart), OpenCode (session.created), Codex (skill)
#
# Usage: bootstrap.sh [--tool claude-code|opencode|codex]

set -euo pipefail

VAULT_PATH="${VAULT_PATH:-$HOME/Vaults/ai}"
export VAULT_PATH

CLI="node $HOME/tools/obsidian-kb/dist/cli.js"
TOOL="${1:---tool}"
TOOL_NAME="${2:-unknown}"

# Parse --tool flag
if [[ "$TOOL" == "--tool" ]] && [[ -n "$TOOL_NAME" ]]; then
  TOOL="$TOOL_NAME"
else
  TOOL="unknown"
fi

# 1. Get project context (auto-detected from cwd)
CONTEXT=$($CLI context --detail summary 2>/dev/null || echo "")

# 2. Get active blockers
BLOCKERS=$($CLI todo list --blockers-only 2>/dev/null || echo "")

# 3. Check for active sessions (conflict detection)
SESSIONS=$($CLI session list 2>/dev/null || echo "")

# 4. Register this session (suppress output)
$CLI session register --tool "$TOOL" >/dev/null 2>&1 || true

# 5. Output context to stdout (tool injects as additionalContext)
if [[ -n "$CONTEXT" ]]; then
  echo "## Knowledge Base Context"
  echo ""
  echo "$CONTEXT"
fi

if [[ -n "$BLOCKERS" ]]; then
  echo ""
  echo "## Active Blockers"
  echo "$BLOCKERS"
fi

if [[ -n "$SESSIONS" ]]; then
  echo ""
  echo "## Active Sessions (other agents working)"
  echo "$SESSIONS"
fi

# 6. Learning count
LEARN_COUNT=$($CLI learn list 2>/dev/null | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read()).get('learnings',[])))" 2>/dev/null || echo "0")
if [[ "$LEARN_COUNT" != "0" ]]; then
  echo ""
  echo "## Learnings: $LEARN_COUNT available (use vault_learn list)"
fi

# 7. Last session info
LAST_SESSION=$($CLI context --detail full 2>/dev/null | python3 -c "
import sys,json
try:
  data = json.loads(sys.stdin.read())
  ls = data.get('last_session')
  if ls and ls.get('outcome'):
    print(ls['outcome'])
except:
  pass
" 2>/dev/null || echo "")
if [[ -n "$LAST_SESSION" ]]; then
  echo "## Last Session: $LAST_SESSION"
fi
