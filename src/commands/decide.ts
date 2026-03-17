import { VaultFS } from "../lib/vault-fs.js";
import { serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";
import { detectProject } from "../lib/project-detector.js";
import { validateProjectSlug } from "../config.js";

export async function decideCommand(
  vaultFs: VaultFS,
  vaultPath: string,
  options: {
    title: string;
    context: string;
    decision: string;
    alternatives?: string;
    consequences?: string;
    project?: string;
  }
): Promise<{ path: string; decision_number: number }> {
  let projectSlug = options.project ?? null;

  if (!projectSlug) {
    projectSlug = await detectProject(process.cwd(), vaultPath);
  }

  if (!projectSlug) {
    throw new Error("Could not detect project. Use --project <slug> to specify.");
  }
  validateProjectSlug(projectSlug);

  // Auto-number: find highest existing decision number
  const decisionsDir = `projects/${projectSlug}/decisions`;
  let nextNumber = 1;

  try {
    const files = await vaultFs.list(decisionsDir, 1);
    for (const file of files) {
      const match = file.match(/(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= nextNumber) nextNumber = num + 1;
      }
    }
  } catch (e) {
    // Directory doesn't exist yet, start at 1
    if (e instanceof Error && !e.message.includes("not found") && !e.message.includes("Not found")) {
      throw e;
    }
  }

  const paddedNumber = String(nextNumber).padStart(3, "0");
  const slug = options.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  const filename = `${paddedNumber}-${slug}.md`;
  const filePath = `${decisionsDir}/${filename}`;

  const fm = createFrontmatter({
    type: "adr",
    project: projectSlug,
    status: "active",
    tags: [],
  });

  const body = `
# ADR-${paddedNumber}: ${options.title}

## Context

${options.context}

## Decision

${options.decision}

## Alternatives Considered

${options.alternatives ?? "None documented."}

## Consequences

${options.consequences ?? "To be evaluated."}
`.trimStart();

  await vaultFs.write(filePath, serializeFrontmatter(fm, body));

  return { path: filePath, decision_number: nextNumber };
}
