# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-03-23

### Added
- **Claude Code Plugin Discovery** — `marketplace.json` manifest for first-class plugin marketplace listing
- **Legacy Migration** — Setup automatically detects and removes old `obsidian-mcp` / `obsidian-kb` MCP entries during install

### Fixed
- **Plugin MCP server** now uses `npx superskill@latest` instead of local `dist/` path — works reliably as an installed plugin without requiring the repo to be cloned locally
- **Teardown** cleans up all legacy entry names (`obsidian-mcp`, `obsidian-kb`) in addition to `superskill`

### Changed
- Version bump from 0.2.0 to 0.2.4

## [0.2.0] - 2026-03-22

### Added
- **Skill Marketplace** — 87 skills cataloged from 9 repos (ECC, Superpowers, gstack, Anthropic, design repos)
- **Collision Detection** — 12 domains mapped with 55 competing skills, profile-based resolution
- **Smart Skill Activation** — `superskill` MCP tool: LLM picks domain based on user intent, loads expert methodology on demand
- **Per-Project Filtering** — Auto-detects stack (Go, React, Django, etc.) and loads only relevant skills (68% bloat reduction)
- **Progressive Disclosure** — Lightweight manifest + on-demand `vault_skill_load` for context-efficient skill loading
- **Auto-Detection** — Stack detector (languages/frameworks), tool detector (Claude Code/Codex/OpenCode/Gemini), auto-profile selection
- **3 Built-in Profiles** — `ecc-first`, `superpowers-first`, `minimal` for collision resolution
- **Layered Generation** — Core (~25k tokens), Extended (~50k), Reference (~31k) tiers sized to model context windows
- **Claude Code Plugin** — `.claude-plugin/plugin.json` + `.mcp.json` for first-class plugin support
- **Dual Licensing** — AGPL-3.0-or-later + Commercial license for businesses >$1M revenue
- **SPDX Headers** — All 51 source files tagged with `AGPL-3.0-or-later OR Commercial`

### Changed
- **Rebranded** from `obsidian-mcp` to `superskill` across all source, tests, configs, and documentation
- **Skill awareness injection** — `vault_resume` and `inject-project-context` now include skill domain menu
- **npm package** renamed to `superskill`
- **GitHub repo** renamed to `permanu/superskill`

## [0.1.2] - 2026-03-21

### Added
- **Auto-setup**: `superskill-cli setup` and `teardown` commands for multi-client MCP registration
- Supports 8 AI clients: Claude Code, Claude Desktop, Cursor, OpenCode, Crush CLI, Codex CLI, Gemini CLI, Droid
- Auto-detects installed clients and configures MCP server entries + behavioral instructions
- Postinstall script prints detected clients after `npm install`
- Preuninstall script cleans up configuration on `npm uninstall`
- `--all`, `--clients`, `--dry-run`, `--force`, `--vault-path` flags for fine-grained control
- Idempotent setup with marker-based instruction injection and backup-before-write safety

## [0.1.1] - 2026-03-20

### Added
- Dual CLI and MCP server interface
- VaultFS for safe filesystem operations
- Project context management and auto-discovery from CWD
- Architecture Decision Records (ADRs)
- Task management with kanban board
- Learning capture and query
- Session registry for multi-agent coordination
- Session resume context for continuing work across sessions
- Full-text search with ripgrep
- Brainstorm documents
- Knowledge graph traversal
- Content lifecycle management: prune, stats, deprecate
- Skill installer plugin with full lifecycle management
- CLI shorthand commands (`r`, `w`, `s`, `c`, `t`, `l`, `sk`)
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)

[0.2.4]: https://github.com/permanu/superskill/compare/v0.2.0...v0.2.4
[0.2.0]: https://github.com/permanu/superskill/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/permanu/superskill/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/permanu/superskill/releases/tag/v0.1.1
