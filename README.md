# SuperSkill

The runtime intelligence layer for AI agent skills.

[![npm](https://img.shields.io/npm/v/superskill)](https://www.npmjs.com/package/superskill)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://www.gnu.org/licenses/agpl-3.0)
[![skills](https://img.shields.io/badge/built--in_skills-87-purple)](https://github.com/permanu/superskill)
[![tools](https://img.shields.io/badge/AI%20tools-8-green)](https://github.com/permanu/superskill)

## The Problem

[skills.sh](https://skills.sh) solved skill discovery and installation — 90,000+ skills, 40+ agents, one standard. But installation is static. You browse, pick, install, and hope you chose right.

When you have 15 skills installed and say "write tests for my Go API" — which one loads? What about the three competing TDD skills? What if the model's context window can't fit them all?

**skills.sh is where you find skills. SuperSkill is what loads the right one at the right time.**

## How It Works

1. **Install skills however you want** — `npx skills add`, manual download, or use the 87 built-in skills
2. **Describe your task** — "write tests for my Go API"
3. **SuperSkill scores, resolves, and loads** — trigger-based matching picks the best skill, resolves collisions, respects your context budget

SuperSkill scans your installed skills (from `~/.claude/skills/`, `~/.cursor/skills/`, etc.), merges them with its built-in catalog, and routes tasks to the best match at runtime.

## What SuperSkill Adds

| Layer | What it does | Why you need it |
|-------|-------------|----------------|
| **Router** | Task description → best matching skill | No manual browsing or memorizing skill names |
| **Arbiter** | 3 TDD skills installed? Profile picks the winner | Prevents collision chaos and token waste |
| **Scanner** | Discovers installed skills from any source | Works with skills.sh, manual installs, or built-in |
| **Memory** | Remembers activations within a session | No redundant fetches for similar tasks |
| **Vault** | ADRs, learnings, sessions, project context | Persistent knowledge that survives across sessions |

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

Then add as an MCP server:

```bash
# Claude Code
claude mcp add superskill -e VAULT_PATH=~/Vaults/ai -- npx -y superskill

# Cursor, Claude Desktop, Codex, Gemini CLI — add to MCP config:
```

```json
{
  "mcpServers": {
    "superskill": {
      "command": "npx",
      "args": ["-y", "superskill"],
      "env": { "VAULT_PATH": "~/Vaults/ai" }
    }
  }
}
```

### Works with skills.sh

Install skills from the ecosystem, SuperSkill routes to them automatically:

```bash
npx skills add anthropics/skills          # Anthropic's official skills
npx skills add affaan-m/everything-claude-code  # ECC skill suite
# SuperSkill discovers and scores these on next activation
```

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

## Built-in Skill Catalog

<details>
<summary>87 skills across 28 domains from 9 repos (click to expand)</summary>

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

</details>

## MCP Tools

| Tool | Description |
|------|-------------|
| `superskill` | Route to the best skill by task description, domain, or skill ID |
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

Copyright 2026 Permanu (Atharva Pandey)
