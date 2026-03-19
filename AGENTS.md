# obsidian-mcp — AGENTS.md

## Project Overview

Universal Agentic Knowledge Base — a CLI tool and MCP server backed by an Obsidian vault (`~/Vaults/ai/`) that serves as shared memory for AI coding tools.

## Commands

- **Build:** `npm run build` (TypeScript → dist/)
- **Dev:** `npm run dev` (build + watch via tsc --watch)
- **Lint:** `npm run lint` (type check only: `tsc --noEmit`)
- **Test:** `npm test` (Vitest test runner: `vitest run`)

## Architecture

- `src/cli.ts` — Commander.js CLI entry point
- `src/mcp-server.ts` — MCP server (stdio transport)
- `src/commands/` — Command modules (pure async functions, shared by CLI + MCP)
- `src/core/` — Command infrastructure (registry, types)
- `src/lib/` — Library modules (vault-fs, frontmatter, search-engine, etc.)
- `src/config.ts` — Configuration + `resolveProject()` utility

## Key Patterns

- **Unified command interface:** Every command takes `(args, ctx: CommandContext)` where ctx bundles vaultFs, vaultPath, config, sessionRegistry, and log.
- **Command registry:** `src/core/registry.ts` maps MCP tool names to command handlers with arg adapters (snake_case → camelCase). MCP server uses `registry.execute()` for dispatch.
- **Dual interface:** Every command works via both CLI and MCP. Commands are pure async functions.
- **Sandboxed filesystem:** `VaultFS` enforces path validation, symlink escape detection, traversal rejection.
- **Project detection:** Auto-detected from CWD via `project-map.json` and git root. Use `resolveProject()` helper.
- **Auto-numbering:** ADRs, tasks, learnings use `NNN-<slug>.md` pattern via `auto-number.ts`.

## Code Conventions

- TypeScript strict mode, ES Modules (ES2022 target)
- No comments unless explicitly requested
- Use `console.error` with a module prefix (e.g., `[search]`, `[session-registry]`) for debug logging in catch blocks
- Don't swallow errors silently — at minimum log unexpected error codes (EACCES, EISDIR)
- All vault filesystem ops go through `VaultFS`; never use raw `fs` for vault paths
- Use `resolveProject()` from config.ts instead of repeating detectProject/validateProjectSlug
- Use `ctx.vaultPath` from CommandContext instead of passing vaultPath as a separate parameter

## Security

- `VaultFS.resolve()` is private — always use public methods (read, write, list, etc.)
- Session lockfiles use `O_CREAT | O_EXCL` for atomic creation
- External process calls use `execFile` (never `exec` with shell)
- `vault_write` defaults to `append` mode to prevent accidental data loss

## Vault Structure

```
~/Vaults/ai/
  project-map.json
  coordination/
    session-registry.json
    locks/
  projects/<slug>/
    context.md, decisions/, tasks/, learnings/, sessions/, brainstorms/, _archive/
```
