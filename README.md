# obsidian-mcp

**Universal Agentic Knowledge Base** — A CLI tool and MCP server backed by an Obsidian vault that serves as shared memory for AI coding tools.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm version](https://img.shields.io/npm/v/obsidian-mcp.svg)](https://www.npmjs.com/package/obsidian-mcp)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

## Features

- **MCP Server** — Works as an MCP server for Claude Desktop, Cursor, OpenCode, and any MCP-compatible client
- **CLI Tool** — Full CLI interface for manual vault operations
- **Project Auto-Discovery** — Detects projects from CWD via git root and project-map.json
- **Knowledge Management** — Tasks, decisions (ADRs), learnings, sessions, brainstorms
- **Full-Text Search** — Powered by ripgrep
- **Skill Installer** — Install and manage AI skills from git repos, local files, or URLs
- **Multi-Agent Coordination** — Session registry for agent swarms

## Installation

### As an MCP Server

Add to your MCP client configuration (see [MCP Setup](#mcp-setup) below). No install needed when using `npx`.

### As a CLI Tool

```bash
npm install -g obsidian-mcp
```

Or use directly with npx:
```bash
npx obsidian-mcp --help
```

## Quick Start

```bash
# Initialize a project
obsidian-mcp init /path/to/your/project

# Read project context
obsidian-mcp c

# Add a task
obsidian-mcp t add "Implement feature X"

# View task board
obsidian-mcp t b

# Search the vault
obsidian-mcp s "authentication"
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

### Claude Desktop

Add to your Claude config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "obsidian-mcp": {
      "command": "npx",
      "args": ["obsidian-mcp"],
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
      "args": ["-y", "obsidian-mcp"]
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
      "args": ["obsidian-mcp"]
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
