import type { CommandContext } from "../core/types.js";
import { VaultFS, VaultError } from "../lib/vault-fs.js";
import { resolveProject } from "../config.js";
import { estimateTokens, truncateToTokenBudget } from "../lib/token-estimator.js";
import { parseFrontmatter } from "../lib/frontmatter.js";

export interface ContextResult {
  project_slug: string;
  context_md: string;
  token_estimate: number;
  sections: string[];
  truncated: boolean;
  learning_count: number;
  last_session: { outcome: string; completed_at: string } | null;
}

export async function contextCommand(
  args: {
    project?: string;
    detailLevel?: "summary" | "full";
    maxTokens?: number;
  } = {} as any,
  ctx: CommandContext,
): Promise<ContextResult> {
  const { detailLevel = "summary", maxTokens } = args;
  const effectiveMaxTokens = maxTokens ?? ctx.config.maxInjectTokens;
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);
  const vaultFs = ctx.vaultFs;
  const contextPath = `projects/${projectSlug}/context.md`;
  const exists = await vaultFs.exists(contextPath);

  const learningCount = await countLearnings(vaultFs, projectSlug);
  const lastSession = await getLastSession(vaultFs, projectSlug);

  if (!exists) {
    return {
      project_slug: projectSlug,
      context_md: `No context file found for project "${projectSlug}". Create one at: ${contextPath}`,
      token_estimate: 20,
      sections: [],
      truncated: false,
      learning_count: learningCount,
      last_session: lastSession,
    };
  }

  const content = await vaultFs.read(contextPath);

  const sections = content
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", "").trim());

  if (detailLevel === "full") {
    return {
      project_slug: projectSlug,
      context_md: content,
      token_estimate: estimateTokens(content),
      sections,
      truncated: false,
      learning_count: learningCount,
      last_session: lastSession,
    };
  }

  const { text, truncated } = truncateToTokenBudget(content, effectiveMaxTokens);

  return {
    project_slug: projectSlug,
    context_md: text,
    token_estimate: estimateTokens(text),
    sections,
    truncated,
    learning_count: learningCount,
    last_session: lastSession,
  };
}

async function countLearnings(vaultFs: import("../lib/vault-fs.js").VaultFS, projectSlug: string): Promise<number> {
  try {
    const files = await vaultFs.list(`projects/${projectSlug}/learnings`, 1);
    return files.filter((f) => f.endsWith(".md")).length;
  } catch (e: unknown) {
    if (e instanceof VaultError && e.code === "FILE_NOT_FOUND") return 0;
    if (e instanceof Error && "code" in e && (e as any).code === "ENOENT") return 0;
    if (e instanceof Error && "code" in e && (e as any).code !== undefined) {
      console.error("[context] Error counting learnings:", e.message);
    }
    return 0;
  }
}

async function getLastSession(
  vaultFs: import("../lib/vault-fs.js").VaultFS,
  projectSlug: string
): Promise<{ outcome: string; completed_at: string } | null> {
  try {
    const files = await vaultFs.list(`projects/${projectSlug}/sessions`, 1);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();

    if (mdFiles.length === 0) return null;

    const content = await vaultFs.read(mdFiles[0]);
    const { data } = parseFrontmatter(content);

    return {
      outcome: (data.outcome as string) ?? "",
      completed_at: (data.completed_at as string) ?? (data.created as string) ?? "",
    };
  } catch (e: unknown) {
    if (!(e instanceof Error && "code" in e && (e as any).code === "ENOENT")) {
      console.error("[context] Error reading last session:", e instanceof Error ? e.message : e);
    }
    return null;
  }
}
