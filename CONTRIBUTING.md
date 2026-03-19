# Contributing to obsidian-mcp

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/gopherine/obsidian-mcp.git
cd obsidian-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run lint
```

## Project Structure

```
src/
├── core/                  # Executor and middleware
├── commands/              # Pure async command functions
├── lib/                   # Library modules (vault-fs, etc.)
├── plugins/               # Plugin modules (skill installer)
├── mcp-server.ts          # MCP server entry point
├── cli.ts                 # CLI entry point
└── config.ts              # Configuration
```

## Code Conventions

### TypeScript

- Strict mode enabled
- ES Modules (ES2022 target)
- Node.js >= 20.0.0

### Code Style

- **No comments** unless explicitly requested
- Use `console.error` with module prefix: `[search]`, `[session-registry]`
- Don't swallow errors silently — log at minimum
- All vault operations go through `VaultFS`

### Commands

Commands are pure async functions:
```typescript
export async function myCommand(
  args: { ... },
  ctx: CommandContext
): Promise<{ ... }> {
  // Implementation
}
```

### Error Handling

Use `VaultError` for vault operations:
```typescript
throw new VaultError("FILE_NOT_FOUND", `Not found: ${path}`);
```

## Testing

```bash
# Run all tests
npm test

# Tests are in *.test.ts files
# Uses Node.js built-in test runner
```

## Linting

```bash
# Type check (no emit)
npm run lint
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests and lint (`npm test && npm run lint`)
5. Commit with conventional format (see below)
6. Push and create a PR

### Commit Message Format

```
type(scope): subject

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(skill): add install from git URL
fix(vault-fs): prevent symlink escape on Windows
docs(readme): add MCP setup instructions
```

## Adding New Commands

1. Create `src/commands/my-command.ts`
2. Export `myCommand()` async function
3. Add CLI handler in `src/cli.ts`
4. Add MCP tool in `src/mcp-server.ts`
5. Add tests in `src/commands/my-command.test.ts`

## Security

- Never use raw `fs` for vault paths — always use `VaultFS`
- Validate all user input (paths, slugs, etc.)
- Use `execFile` never `exec` with shell
- Session locks use `O_CREAT | O_EXCL` for atomic creation

## Questions?

Open an issue for bugs, feature requests, or questions.
