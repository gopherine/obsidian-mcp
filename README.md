# SuperSkill

One plugin, every skill. The package manager for AI coding agents.

[![npm](https://img.shields.io/npm/v/superskill)](https://www.npmjs.com/package/superskill)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://www.gnu.org/licenses/agpl-3.0)
[![skills](https://img.shields.io/badge/skills-87-purple)](https://github.com/permanu/superskill)
[![tools](https://img.shields.io/badge/AI%20tools-8-green)](https://github.com/permanu/superskill)

## The Problem

There are 9+ open-source skill repos for AI coding agents, containing 87+ skills across 28 domains. Installing them all means token bloat and collisions — three different TDD skills fighting for context. Installing none means your agent wings it. There's no package manager.

## How It Works

1. **Install** — `npm install -g superskill`
2. **Describe your task** — "write tests for my Go API"
3. **SuperSkill finds and loads the right methodology** — resolves collisions, filters by your stack, injects only what's relevant

No manual skill management. The AI agent calls SuperSkill automatically when it recognizes a matching task.

## Key Features

- **87 skills from 9 repos** — ECC, Superpowers, gstack, Anthropic, design repos, and more. One catalog, one resolution layer.
- **Works across 8 AI tools** — Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI, OpenCode, Crush CLI, Droid.
- **Collision resolution** — When multiple repos provide skills for the same domain (TDD, planning, code review, etc.), profiles pick the winner.
- **Stack-aware filtering** — Auto-detects your project (Go, React, Django, Spring Boot, etc.) and loads only relevant skills.
- **Web discovery** — If no local skill matches, searches GitHub for community skills.
- **Security scanning** — Community skills are scanned for prompt injection, data exfiltration, and destructive commands before loading.
- **Progressive disclosure** — Lightweight manifest (~100 tokens/skill) for small-context models; full content on demand.
- **Knowledge vault** — Persistent project memory: tasks, ADRs, learnings, session resume, brainstorms. Cross-tool, cross-session.

## Supported AI Tools

| Tool | Setup | Status |
|------|-------|--------|
| **Claude Code** | Plugin or MCP | Verified |
| **Claude Desktop** | MCP config | Verified |
| **Cursor** | MCP config | Verified |
| **Codex CLI** | MCP config | Verified |
| **Gemini CLI** | MCP config | Verified |
| **OpenCode** | MCP config | Community |
| **Crush CLI** | MCP config | Community |
| **Droid** | MCP config | Community |

## Available Skills

<details>
<summary>28 domains across 9 repos (click to expand)</summary>

**Core Workflow** — loaded for every project:

| Domain | Skills | Description |
|--------|--------|-------------|
| TDD | 8 | Red-green-refactor, Go/Python/Django/Spring/C++ testing, E2E |
| Planning | 3 | Implementation planning, CEO/eng review, execution |
| Code Review | 4 | PR review, Go review, Python review, feedback workflow |
| Debugging | 2 | Systematic debugging, investigation |
| Verification | 4 | Build/lint/type gates, Django/Spring verification |
| Brainstorming | 2 | Structured ideation, office hours |
| Agent Orchestration | 5 | Autonomous loops, RFC pipelines, subagents, parallel dispatch |
| Security | 5 | OWASP review, AgentShield scanning, Django/Spring security |
| Shipping | 2 | CI/CD, deployment patterns |
| Frontend Design | 5 | Anthropic official, Design Taste, Bencium UX, FDP, UI/UX Pro Max |
| Git Workflow | 2 | Worktrees, branch management |

**Language & Framework** — loaded when your stack matches:

| Domain | Skills | Description |
|--------|--------|-------------|
| Go | 2 | Idiomatic patterns, conventions |
| Python | 2 | Pythonic idioms, PEP 8 |
| Django | 3 | Architecture, DRF, ORM, security, TDD |
| Spring Boot | 4 | Architecture, security, TDD, verification |
| Swift | 4 | SwiftUI, concurrency, actors, protocol DI |
| C++ | 2 | Core Guidelines, GoogleTest |
| Java | 2 | Standards, JPA/Hibernate |
| Database | 3 | PostgreSQL, migrations, ClickHouse |
| Docker | 1 | Compose, container security |

**Infrastructure & Patterns:**

| Domain | Skills | Description |
|--------|--------|-------------|
| API Design | 1 | REST patterns, pagination, versioning |
| Frontend Patterns | 1 | React/Next.js state and performance |
| Backend Patterns | 1 | Node/Express server patterns |
| Coding Standards | 1 | Universal TS/JS/React standards |

**Specialized:**

| Domain | Skills | Description |
|--------|--------|-------------|
| Content & Business | 6 | Articles, investor materials, outreach, market research |
| 3D Animation | 5 | Three.js, GSAP, React Three Fiber, Framer Motion, Babylon.js |
| Agent Engineering | 4 | Agent harness, eval, cost optimization |
| Meta/Tooling | 5 | Skill management, compaction, learning, browsing |

**Source repos:** [ECC](https://github.com/affaan-m/everything-claude-code), [Superpowers](https://github.com/obra/superpowers), [gstack](https://github.com/garrytan/gstack), [Anthropic Skills](https://github.com/anthropics/skills), [Design Skillstack](https://github.com/freshtechbro/claudedesignskills), [Taste](https://github.com/Leonxlnx/taste-skill), [Bencium](https://github.com/bencium/bencium-claude-code-design-skill), [Frontend Design Pro](https://github.com/claudekit/frontend-design-pro-demo), [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

</details>

## Quick Start

### Claude Code Plugin (recommended)

```bash
/plugin marketplace add permanu/superskill
/plugin install superskill
```

### Any MCP-compatible tool

```bash
npm install -g superskill
```

Then configure as an MCP server. For Claude Code:

```bash
claude mcp add superskill -e VAULT_PATH=~/Vaults/ai -- npx -y superskill
```

For Cursor, Claude Desktop, Codex, Gemini CLI, and others — add to your MCP config:

```json
{
  "mcpServers": {
    "superskill": {
      "command": "npx",
      "args": ["-y", "superskill"],
      "env": {
        "VAULT_PATH": "~/Vaults/ai"
      }
    }
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `superskill` | Load expert methodology by domain, task description, or skill ID |
| `vault_skill` | Skill catalog, collisions, resolution, generation |
| `vault_project_context` | Auto-detected project context from CWD |
| `vault_init` | Generate draft context.md from a git repo |
| `vault_task` | Task management (add/list/update/board) |
| `vault_decide` | Log architecture decisions |
| `vault_learn` | Capture and list learnings |
| `vault_resume` | Resume context — recent sessions, interrupted work, next steps |
| `vault_session` | Multi-agent session coordination |
| `vault_read` | Read file or directory from vault |
| `vault_write` | Write/append/prepend content |
| `vault_search` | Full-text search across vault |
| `vault_prune` | Archive stale content |
| `vault_stats` | Vault content statistics |
| `vault_deprecate` | Mark items as deprecated |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_PATH` | `~/Vaults/ai` | Path to knowledge vault |
| `MAX_INJECT_TOKENS` | `1500` | Max tokens for context injection |
| `SESSION_TTL_HOURS` | `2` | Session heartbeat TTL |

## Roadmap

See [GitHub Milestones](https://github.com/permanu/superskill/milestones) for planned work.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

AGPL-3.0-or-later — See [LICENSE](./LICENSE)

Commercial license available for organizations with >$1M annual revenue. See [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md).

Copyright 2026 Permanu (Atharva Pandey)
