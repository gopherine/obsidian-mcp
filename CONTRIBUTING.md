# Contributing to SuperSkill

SuperSkill is the skill package manager for AI coding agents. Contributions are welcome — whether you're adding skills to the registry, improving the runtime, or fixing bugs.

## Quick Start

```bash
git clone https://github.com/permanu/superskill.git
cd superskill
npm install
npm run build
npm test
```

## Development Workflow

### Branching

- `main` is the release branch — always shippable
- Feature branches: `feat/<name>` (e.g. `feat/session-memory`)
- Bug fixes: `fix/<name>` (e.g. `fix/false-positive-go-pattern`)
- Docs: `docs/<name>`

### Pull Requests

1. Create a branch from `main`
2. Make your changes with tests
3. Ensure `npm run build && npm test` passes locally
4. Open a PR against `main`
5. PRs require CI to pass (lint + build + test:coverage)
6. Squash merge — one clean commit per PR

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add session-aware skill memory
fix: tighten regex for Go domain matching
docs: add contributing guide
ci: add automated release workflow
chore: bump version to 0.3.0
```

Include `Fixes #N` or `Closes #N` to auto-close issues.

## Release Process

### Release Discipline

Releases are **batched, not per-PR**. Multiple PRs accumulate on `main` before a release is cut.

**When to release:**
- A milestone is complete (e.g. all v0.3.0 issues closed)
- A logical batch of features/fixes is ready
- A critical security fix needs immediate deployment

**When NOT to release:**
- After every individual PR
- To test if something works (use `--plugin-dir` for local testing)
- Without updating the changelog

### Release Checklist

1. **Update `CHANGELOG.md`** — Move items from `[Unreleased]` to a new version section
2. **Bump version** in `package.json` — follow [semver](https://semver.org/):
   - Patch (0.2.x): bug fixes, minor improvements
   - Minor (0.x.0): new features, backward-compatible
   - Major (x.0.0): breaking changes
3. **Commit**: `chore: bump version to X.Y.Z`
4. **Push to main**: `git push origin main`
5. **Tag and push**: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. **Automated**: CI runs lint + test + coverage → npm publish → GitHub release

The release workflow (`.github/workflows/release.yml`) handles npm publish and GitHub release creation automatically. Release notes are extracted from `CHANGELOG.md`.

### Changelog Format

Keep an `[Unreleased]` section at the top. Move entries to a versioned section when cutting a release:

```markdown
## [Unreleased]

### Added
- New feature description

### Fixed
- Bug fix description

## [0.3.0] - 2026-04-01

### Added
- ...
```

## Adding Skills to the Registry

### Current: Static Catalog

Skills are defined in `src/commands/skill/catalog.ts`. To add a skill:

1. Find the skill's source URL (raw GitHub URL to the SKILL.md file)
2. Add an entry to the `CATALOG` array:

```typescript
{
  id: "source/skill-name",
  name: "Human-Readable Name",
  repo: "source",
  domains: ["relevant-domain"],
  source: "https://raw.githubusercontent.com/owner/repo/main/path/SKILL.md",
  description: "One-line description",
},
```

3. Add trigger patterns in the `TASK_DOMAIN_MAP` if your skill introduces a new domain
4. Add tests in `marketplace.test.ts`

### Future: Registry JSON (v0.3.0)

Skills will be defined in `registry/index.json` instead of TypeScript. See the [design spec](docs/superpowers/specs/2026-03-23-superskill-package-manager-design.md) for the planned format.

## Writing Tests

- All new features require tests
- All bug fixes require a regression test
- Run: `npm test` (all tests) or `npm test -- src/path/to/file.test.ts` (single file)
- Coverage thresholds: 80% lines, 85% functions, 80% branches, 80% statements

### Test Patterns

```typescript
import { describe, it, expect } from "vitest";

describe("myFeature", () => {
  it("does the expected thing", () => {
    // Arrange → Act → Assert
  });

  it("handles edge case", () => {
    // ...
  });

  // False positive guards for regex patterns
  it("does NOT match unrelated input", () => {
    expect(matchSomething("irrelevant")).not.toContain("wrong-domain");
  });
});
```

## Project Structure

```
src/
├── commands/skill/       # Skill marketplace, catalog, activation
│   ├── catalog.ts        # Static skill catalog (→ registry in v0.3.0)
│   ├── marketplace.ts    # Resolve, generate, activate, fetch
│   └── web-discovery.ts  # GitHub search for community skills
├── core/
│   └── registry.ts       # MCP tool definitions and routing
├── lib/
│   ├── auto-profile.ts   # Stack/tool detection, profile selection
│   ├── skill-registry.ts # Local installed skills
│   └── vault-fs.ts       # Safe filesystem operations
└── mcp-server.ts         # MCP server entry point
```

## Code Style

- TypeScript strict mode
- No AI attribution in commits or code
- SPDX license headers on all source files: `// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial`
- Prefer explicit types over `any`
- Keep functions focused — if it's doing two things, split it

## Security

Community skills fetched via web discovery are scanned for:
- Prompt injection / override attempts
- Data exfiltration patterns
- Destructive filesystem commands
- Script injection
- Memory wipe instructions

Role-play instructions ("you are now acting as X") are allowed with a warning — this is normal for skills that adopt a persona.

If you're modifying `web-discovery.ts`, ensure security scan tests pass and cover your changes.

## License

By contributing, you agree that your contributions will be licensed under the project's [AGPL-3.0-or-later](LICENSE) license, with the option for commercial licensing under the [Commercial License](LICENSE-COMMERCIAL.md).

## Questions?

Open an issue or start a discussion on the [GitHub repo](https://github.com/permanu/superskill).
