# obsidian-mcp

**Universal Agentic Knowledge Base** — A CLI tool and MCP server backed by an Obsidian vault that serves as shared memory for AI coding tools.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Release](https://img.shields.io/github/v/release/gopherine/obsidian-mcp)](https://github.com/gopherine/obsidian-mcp/releases)

## Features

- **MCP Server** — Works as an MCP server for Claude Desktop, Cursor, OpenCode, and any MCP-compatible client
- **CLI Tool** — Full CLI interface for manual vault operations
- **Project Auto-Discovery** — Detects projects from CWD via git root and project-map.json
- **Knowledge Management** — Tasks, decisions (ADRs), learnings, sessions, brainstorms
- **Full-Text Search** — Powered by ripgrep
- **Skill Installer** — Install and manage AI skills from git repos, local files, or URLs
- **Multi-Agent Coordination** — Session registry for agent swarms

## Installation

```bash
npm install -g @gopherine/obsidian-mcp
```

Or use directly with npx (no install needed):
```bash
npx @gopherine/obsidian-mcp
```

Or clone and build:
```bash
git clone https://github.com/gopherine/obsidian-mcp.git
cd obsidian-mcp
npm install && npm run build
```

> **Note:** The default binary runs the MCP server. The CLI is available as `obsidian-mcp-cli`.

## Quick Start

```bash
# MCP server (add to your MCP client config — see below)
npx @gopherine/obsidian-mcp

# CLI tool
npx @gopherine/obsidian-mcp-cli --help
```

## CLI Commands

| Shorthand | Full Command | Description |
|-----------|--------------|-------------|
| `r` | `read <path>` | Read a vault note |
| `w` | `write <path>` | Write/create a vault note |
| `s` | `search <query>` | Search the vault |
| `c` | `context` | Get project context |
| `i` | `init <path>` | Initialize project context |
| `d` | `decide` | Log an architecture decision |
| `t` | `task` | Manage tasks |
| `t add` | `task add` | Add a task |
| `t ls` | `task list` | List tasks |
| `t b` | `task board` | Show kanban board |
| `l` | `learn` | Manage learnings |
| `l add` | `learn add` | Capture a learning |
| `l ls` | `learn list` | List learnings |
| `sk i` | `skill install` | Install a skill |
| `sk ls` | `skill list` | List installed skills |
| `sk rm` | `skill delete` | Remove a skill |

## MCP Setup

### Claude Code

Add to your project's `CLAUDE.md` or run:
```bash
claude mcp add obsidian-mcp -- npx -y @gopherine/obsidian-mcp
```

Or add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "npx",
      "args": ["-y", "@gopherine/obsidian-mcp"]
    }
  }
}
```

Set your vault path:
```bash
claude mcp add obsidian-mcp -e VAULT_PATH=~/Vaults/ai -- npx -y @gopherine/obsidian-mcp
```

### Claude Desktop

Add to your Claude config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "npx",
      "args": ["-y", "@gopherine/obsidian-mcp"],
      "env": {
        "VAULT_PATH": "~/Vaults/ai"
      }
    }
  }
}
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "npx",
      "args": ["-y", "@gopherine/obsidian-mcp"]
    }
  }
}
```

### OpenCode

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@gopherine/obsidian-mcp"]
    }
  }
}
```

### OpenAI Codex

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "npx",
      "args": ["-y", "@gopherine/obsidian-mcp"]
    }
  }
}
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VAULT_PATH` | `~/Vaults/ai` | Path to Obsidian vault |
| `MAX_INJECT_TOKENS` | `1500` | Max tokens for context injection |
| `SESSION_TTL_HOURS` | `2` | Session heartbeat TTL |

## Vault Structure

```
~/Vaults/ai/
├── project-map.json           # Path → slug mappings
├── coordination/
│   ├── session-registry.json  # Active agent sessions
│   └── locks/                 # PID lockfiles
├── skills/
│   ├── installed/             # Installed skills
│   └── registry.json          # Skill metadata
└── projects/<slug>/
    ├── context.md             # Project overview
    ├── decisions/             # Architecture Decision Records
    ├── tasks/                 # Task files
    ├── learnings/             # Learning captures
    ├── sessions/              # Session notes
    ├── brainstorms/           # Brainstorm documents
    └── _archive/              # Pruned content
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `vault_read` | Read file or directory |
| `vault_write` | Write/append/prepend content |
| `vault_search` | Full-text search |
| `vault_project_context` | Get project context |
| `vault_init` | Generate draft context.md |
| `vault_decide` | Log architecture decision |
| `vault_task` | Manage tasks (add/list/update/board) |
| `vault_learn` | Capture/list learnings |
| `vault_session` | Register/heartbeat/complete sessions |
| `vault_skill_*` | Skill installer operations |
| `vault_prune` | Archive/delete stale content |
| `vault_stats` | Content statistics |
| `vault_resume` | Resume context for continuing work |
| `vault_deprecate` | Mark items as deprecated |

## Testing

```bash
# Run all tests with Vitest
npm test

# Run with coverage (target: 90%+)
npm run test:coverage

# Run specific test file
npm test src/commands/task.test.ts

# Watch mode
npm run test:watch
```

Tests use **table-driven pattern** for comprehensive coverage. All test files are `*.test.ts` alongside source files.

## Documentation

- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Changelog](./CHANGELOG.md)

## License

AGPL-3.0 — See [LICENSE](./LICENSE)
