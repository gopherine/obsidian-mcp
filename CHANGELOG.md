# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Skill installer plugin with full lifecycle management (`vault_skill_*` tools)
- CLI shorthand commands for faster operations (`r`, `w`, `s`, `c`, `t`, `l`, `sk`)
- MCP tool annotations for better AI integration (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
- Progress reporting for long-running operations
- Structured logging with module prefixes
- CommandExecutor with middleware pattern
- AGPL-3.0 license
- README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md

### Changed
- Refactored to modular architecture with middleware pattern
- Unified error handling across MCP and CLI interfaces
- Improved MCP handler error responses with structured codes

## [0.2.0] - 2025-01-XX

### Added
- Session resume context for continuing work across sessions
- OpenCode auto-bootstrap and cross-tool handoff
- Content lifecycle management: prune, stats, deprecate
- VaultFS delete and move operations
- Task board (kanban view)
- Learning capture and query
- Session history persistence
- Project auto-discovery from CWD

### Changed
- Improved VaultFS symlink escape detection
- Better error handling and validation

### Fixed
- Security and reliability bugs from audit

## [0.1.0] - 2024-12-XX

### Added
- Initial release
- Dual CLI and MCP server interface
- VaultFS for safe filesystem operations
- Project context management
- Architecture Decision Records (ADRs)
- Task management
- Session registry for multi-agent coordination
- Full-text search with ripgrep
- Brainstorm documents
- Knowledge graph traversal

[Unreleased]: https://github.com/gopherine/obsidian-mcp/compare/v0.1.1...HEAD
[0.2.0]: https://github.com/gopherine/obsidian-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gopherine/obsidian-mcp/releases/tag/v0.1.0
