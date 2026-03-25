# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-25

### Added
- **Skill scanner** — Discovers installed SKILL.md files from `~/.claude/skills/`, `~/.cursor/skills/`, and other standard directories. Works with skills installed via `npx skills add` (skills.sh ecosystem) or manual installation.
- **Local skill merging** — Scanned local skills are merged into the registry at startup. Trigger matcher scores against both built-in and locally installed skills.

### Changed
- **Repositioned as runtime intelligence layer** — SuperSkill is no longer positioned as a package manager. It's the routing layer that sits on top of the Agent Skills ecosystem (skills.sh). "skills.sh is where you find skills. SuperSkill is what loads the right one at the right time."
- **README rewritten** — New positioning, skills.sh integration documented, clearer value proposition
- **Tool description updated** — "Runtime skill router" replaces "skill package manager"
- **Skill awareness block** — Shows installed skill count when local skills are detected
- **Package description** updated across package.json, plugin.json, MCP server

## [0.3.0] - 2026-03-25

### Added
- **Central skill registry** — Runtime JSON registry at `registry/index.json` replaces hardcoded TypeScript catalog. 87 skills, 28 domains, 9 sources, 3 profiles. Adding a new skill is now a JSON edit, not a code change. (#2, #17)
- **Trigger-based skill matching** — Keyword scoring with lightweight stemming replaces regex-based `TASK_DOMAIN_MAP`. All 28 domains now discoverable by LLMs via dynamic tool description. Fixes "UX design" tasks returning "No matching superskill". (#4)
- **Session-aware skill memory** — In-process cache remembers activated skills so repeat calls with similar tasks return instantly without re-fetching. (#5)
- **Registry loader** — `registry-loader.ts` loads registry from user override (`~/.superskill/registry/index.json`) or bundled fallback. Schema validation, memory caching.

### Changed
- **web-discovery.ts refactored** — 438-line mixed-concern file decomposed into 4 focused modules: `text-utils.ts`, `url-utils.ts`, `security-scanner.ts`, `github-client.ts`
- **catalog.ts rewritten** — Now a facade over the registry with getter functions (`getCatalog()`, `getDomains()`, `getDomainPriority()`). Static exports kept as fallbacks for backward compatibility.
- **Tool description dynamic** — `superskill` MCP tool description now lists all 28 domain names so LLMs know the full capability surface
- **License simplified** — AGPL-3.0-or-later only, removed commercial dual-license

### Testing
- 832 tests across 57 files, 90%+ coverage on all new code
- 20 regression tests ensuring TASK_DOMAIN_MAP parity with trigger scoring
- Registry data integrity tests (valid sources, domains, triggers, profiles)

## [0.2.7] - 2026-03-23

### Added
- **Prefetch core skills on install** — 8 core skills (brainstorming, planning, TDD, code review, debugging, security, verification, shipping) fetched from source repos during `npm install` and cached at `~/.superskill/cache/` for offline availability (#6)
- **Local analytics** — Privacy-first skill activation tracking at `~/.superskill/analytics.json`. Tracks activations, match methods, failed searches, and web discovery attempts. Auto-rotates at 1000 entries. (#9)
- **Contributing guide** — Release discipline, PR workflow, skill submission process, test patterns, and security guidelines (#8)

### Fixed
- **Security scanner false positive** — Role-play instructions ("you are now acting as X") moved from hard block to soft warning. Skills legitimately adopt personas; only memory wipe instructions remain blocked.

### Changed
- **README overhaul** — Repositioned as product storefront. One-liner value prop, 3-step setup, collapsible skill catalog, supported tools table. Removed internal implementation details. (#13)
- **marketplace.ts split** — 809-line god file decomposed into 5 focused modules: activate.ts, resolve.ts, generate.ts, manifest.ts, helpers.ts. Barrel re-export preserves backward compatibility.

### Performance
- **Web discovery caching** — Results cached at `~/.superskill/discovery-cache.json` with 24h TTL, max 100 entries with LRU eviction. Avoids GitHub API rate limits on repeated searches.

### Testing
- **11 integration tests** for the full activation flow — direct skill_id load, domain activation, task trigger matching, multi-domain, web discovery fallback, GitHub URL loading, 3-per-domain cap, manifest generation

## [0.2.6] - 2026-03-23

### Fixed
- **Web discovery search** — Repo search now uses `in:name,description,readme` instead of restrictive topic filters. `deanpeters/Product-Manager-Skills` (2340 stars) and similar repos now discoverable
- **Code search** — Uses `filename:SKILL` qualifier instead of `language:markdown` for more accurate results

### Added
- **Security scanning for community skills** — All discovered skills are scanned before loading for prompt injection, identity hijacking, data exfiltration, destructive commands, and script injection. Hard blocks on dangerous content, soft warnings on suspicious patterns
- **50KB size cap** on skill files to prevent oversized payloads

## [0.2.5] - 2026-03-23

### Added
- **Web Discovery** — When no skill matches in the catalog, superskill searches GitHub for community skills instead of giving up. Results include trust signals (stars, freshness, source repo) and require user confirmation before loading
- **Full domain coverage** — Task matching expanded from 11 to 28 domains. Skills in Go, Python, Django, Swift, Docker, content-business, 3D animation, and more are now discoverable

### Fixed
- **Invisible skills bug** — Tool description and task matching previously hardcoded 11 of 28 domains, making half the catalog invisible to LLMs
- **Single skill per domain** — Activating a domain now loads up to 3 skills (collision winner + alternatives) instead of just one
- **False positive patterns** — Tightened regex for `go`, `eval`, `query`, `ship` to prevent over-triggering

### Changed
- **Tool description** — Replaced 15-line domain taxonomy with 4-line verb-led trigger format
- **`task` is now the primary param** — `domain` accepted as optional alias

## [0.2.4] - 2026-03-23

### Added
- **Claude Code Plugin Discovery** — `marketplace.json` manifest for first-class plugin marketplace listing
- **Legacy Migration** — Setup automatically detects and removes old `obsidian-mcp` / `obsidian-kb` MCP entries during install
- **Package Manager Design Spec** — Architecture for evolving SuperSkill into a dynamic skill package manager with on-demand fetch, version-pinned caching, and intelligent routing

### Fixed
- **Plugin MCP server** now uses `npx superskill@latest` instead of local `dist/` path — works reliably as an installed plugin without requiring the repo to be cloned locally
- **Teardown** cleans up all legacy entry names (`obsidian-mcp`, `obsidian-kb`) in addition to `superskill`

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

[0.2.7]: https://github.com/permanu/superskill/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/permanu/superskill/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/permanu/superskill/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/permanu/superskill/compare/v0.2.0...v0.2.4
[0.2.0]: https://github.com/permanu/superskill/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/permanu/superskill/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/permanu/superskill/releases/tag/v0.1.1
