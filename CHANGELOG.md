# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-03-21

### Added
- **Auto-setup**: `obsidian-mcp-cli setup` and `teardown` commands for multi-client MCP registration
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

[Unreleased]: https://github.com/gopherine/obsidian-mcp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/gopherine/obsidian-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gopherine/obsidian-mcp/releases/tag/v0.1.1
