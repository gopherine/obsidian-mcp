import { VaultFS } from "../lib/vault-fs.js";
import { detectProject } from "../lib/project-detector.js";
import { validateProjectSlug } from "../config.js";
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
  vaultFs: VaultFS,
  vaultPath: string,
  options: {
    project?: string;
    detailLevel?: "summary" | "full";
    maxTokens?: number;
  } = {}
): Promise<ContextResult> {
  const { detailLevel = "summary", maxTokens = 1500 } = options;
  let projectSlug = options.project ?? null;

  // Auto-detect project from cwd
  if (!projectSlug) {
    projectSlug = await detectProject(process.cwd(), vaultPath);
  }

  if (!projectSlug) {
    throw new Error(
      "Could not detect project from current directory. Use --project <slug> to specify."
    );
  }

  validateProjectSlug(projectSlug);
  const contextPath = `projects/${projectSlug}/context.md`;
  const exists = await vaultFs.exists(contextPath);

  // Scan learning count
  const learningCount = await countLearnings(vaultFs, projectSlug);

  // Scan last session
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

  // Extract section headings
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

  // Summary mode: truncate to token budget
  const { text, truncated } = truncateToTokenBudget(content, maxTokens);

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

async function countLearnings(vaultFs: VaultFS, projectSlug: string): Promise<number> {
  try {
    const files = await vaultFs.list(`projects/${projectSlug}/learnings`, 1);
    return files.filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function getLastSession(
  vaultFs: VaultFS,
  projectSlug: string
): Promise<{ outcome: string; completed_at: string } | null> {
  try {
    const files = await vaultFs.list(`projects/${projectSlug}/sessions`, 1);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse();

    if (mdFiles.length === 0) return null;

    const content = await vaultFs.read(`projects/${projectSlug}/sessions/${mdFiles[0]}`);
    const { data } = parseFrontmatter(content);

    return {
      outcome: (data.outcome as string) ?? "",
      completed_at: (data.completed_at as string) ?? (data.created as string) ?? "",
    };
  } catch {
    return null;
  }
}
