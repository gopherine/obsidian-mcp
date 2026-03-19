import type { CommandContext } from "../core/types.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { getNextNumber, slugify } from "../lib/auto-number.js";

export type Confidence = "high" | "medium" | "low";

export interface LearningItem {
  id: string;
  title: string;
  confidence: Confidence;
  tags: string[];
  created: string;
  path: string;
}

const VALID_CONFIDENCE: Confidence[] = ["high", "medium", "low"];

export async function learnCommand(
  args: {
    action: "add" | "list";
    title?: string;
    discovery?: string;
    project?: string;
    tags?: string[];
    confidence?: Confidence;
    source?: string;
    sessionId?: string;
    tag?: string;
  },
  ctx: CommandContext,
): Promise<{
  learning_id?: string;
  path?: string;
  learnings?: LearningItem[];
}> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);
  const vaultFs = ctx.vaultFs;
  const learningsDir = `projects/${projectSlug}/learnings`;

  switch (args.action) {
    case "add": {
      if (!args.title) throw new Error("Title required for add");
      if (!args.discovery) throw new Error("Discovery required for add");

      const confidence = args.confidence ?? "medium";
      if (!VALID_CONFIDENCE.includes(confidence)) {
        throw new Error(`Invalid confidence "${confidence}". Must be one of: ${VALID_CONFIDENCE.join(", ")}`);
      }

      const nextNum = await getNextNumber(vaultFs, learningsDir);
      const padded = String(nextNum).padStart(3, "0");
      const titleSlug = slugify(args.title);
      const filename = `${padded}-${titleSlug}.md`;
      const filePath = `${learningsDir}/${filename}`;
      const learningId = padded;

      const fm = createFrontmatter({
        type: "learning",
        project: projectSlug,
        status: "active",
        confidence,
        source: args.source ?? "",
        session_id: args.sessionId ?? "",
        tags: args.tags ?? [],
      });

      const body = `\n# ${args.title}\n\n${args.discovery}\n`;
      await vaultFs.write(filePath, serializeFrontmatter(fm, body));

      return { learning_id: learningId, path: filePath };
    }

    case "list": {
      const learnings = await listLearnings(vaultFs, learningsDir);
      let filtered = learnings;

      if (args.tag) {
        filtered = filtered.filter((l) => l.tags.includes(args.tag!));
      }

      return { learnings: filtered };
    }

    default:
      throw new Error(`Unknown action: ${args.action}`);
  }
}

async function listLearnings(vaultFs: import("../lib/vault-fs.js").VaultFS, learningsDir: string): Promise<LearningItem[]> {
  const learnings: LearningItem[] = [];

  let files: string[];
  try {
    files = await vaultFs.list(learningsDir, 1);
  } catch {
    return [];
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const filePath = file;

    try {
      const content = await vaultFs.read(filePath);
      const { data, content: body } = parseFrontmatter(content);

      if (data.type !== "learning") continue;

      const basename = file.split("/").pop() ?? file;
      const idMatch = basename.match(/^(\d+)-/);
      if (!idMatch) continue;

      const titleMatch = body.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file;

      learnings.push({
        id: idMatch[1],
        title,
        confidence: (data.confidence as Confidence) ?? "medium",
        tags: Array.isArray(data.tags) ? data.tags as string[] : [],
        created: (data.created as string) ?? "",
        path: filePath,
      });
    } catch (e: unknown) {
      if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
        console.error("[learn] Skipping unreadable learning file:", e instanceof Error ? e.message : e);
      }
    }
  }

  learnings.sort((a, b) => a.id.localeCompare(b.id));
  return learnings;
}
