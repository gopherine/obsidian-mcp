// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CommandContext } from "../core/types.js";
import { serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { getNextNumber, slugify } from "../lib/auto-number.js";

export async function decideCommand(
  args: {
    title: string;
    context: string;
    decision: string;
    alternatives?: string;
    consequences?: string;
    project?: string;
  },
  ctx: CommandContext,
): Promise<{ path: string; decision_number: number }> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);

  const decisionsDir = `projects/${projectSlug}/decisions`;
  const nextNumber = await getNextNumber(ctx.vaultFs, decisionsDir);
  const paddedNumber = String(nextNumber).padStart(3, "0");
  const slug = slugify(args.title);
  const filename = `${paddedNumber}-${slug}.md`;
  const filePath = `${decisionsDir}/${filename}`;

  const fm = createFrontmatter({
    type: "adr",
    project: projectSlug,
    status: "active",
    tags: [],
  });

  const body = `
# ADR-${paddedNumber}: ${args.title}

## Context

${args.context}

## Decision

${args.decision}

## Alternatives Considered

${args.alternatives ?? "None documented."}

## Consequences

${args.consequences ?? "To be evaluated."}
`.trimStart();

  await ctx.vaultFs.write(filePath, serializeFrontmatter(fm, body));

  return { path: filePath, decision_number: nextNumber };
}
