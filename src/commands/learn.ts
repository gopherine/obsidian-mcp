import { VaultFS } from "../lib/vault-fs.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter } from "../lib/frontmatter.js";
import { detectProject } from "../lib/project-detector.js";
import { validateProjectSlug } from "../config.js";
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
  vaultFs: VaultFS,
  vaultPath: string,
  options: {
    action: "add" | "list";
    title?: string;
    discovery?: string;
    project?: string;
    tags?: string[];
    confidence?: Confidence;
    source?: string;
    sessionId?: string;
    tag?: string; // filter for list
  }
): Promise<{
  learning_id?: string;
  path?: string;
  learnings?: LearningItem[];
}> {
  let projectSlug = options.project ?? null;

  if (!projectSlug) {
    projectSlug = await detectProject(process.cwd(), vaultPath);
  }

  if (!projectSlug) {
    throw new Error("Could not detect project. Use --project <slug> to specify.");
  }
  validateProjectSlug(projectSlug);

  const learningsDir = `projects/${projectSlug}/learnings`;

  switch (options.action) {
    case "add": {
      if (!options.title) throw new Error("Title required for add");
      if (!options.discovery) throw new Error("Discovery required for add");

      const confidence = options.confidence ?? "medium";
      if (!VALID_CONFIDENCE.includes(confidence)) {
        throw new Error(`Invalid confidence "${confidence}". Must be one of: ${VALID_CONFIDENCE.join(", ")}`);
      }

      const nextNum = await getNextNumber(vaultFs, learningsDir);
      const padded = String(nextNum).padStart(3, "0");
      const titleSlug = slugify(options.title);
      const filename = `${padded}-${titleSlug}.md`;
      const filePath = `${learningsDir}/${filename}`;
      const learningId = padded;

      const fm = createFrontmatter({
        type: "learning",
        project: projectSlug,
        status: "active",
        confidence,
        source: options.source ?? "",
        session_id: options.sessionId ?? "",
        tags: options.tags ?? [],
      });

      const body = `\n# ${options.title}\n\n${options.discovery}\n`;
      await vaultFs.write(filePath, serializeFrontmatter(fm, body));

      return { learning_id: learningId, path: filePath };
    }

    case "list": {
      const learnings = await listLearnings(vaultFs, learningsDir);
      let filtered = learnings;

      if (options.tag) {
        filtered = filtered.filter((l) => l.tags.includes(options.tag!));
      }

      return { learnings: filtered };
    }

    default:
      throw new Error(`Unknown action: ${options.action}`);
  }
}

async function listLearnings(vaultFs: VaultFS, learningsDir: string): Promise<LearningItem[]> {
  const learnings: LearningItem[] = [];

  let files: string[];
  try {
    files = await vaultFs.list(learningsDir, 1);
  } catch {
    return [];
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    // list() returns paths relative to vault root, use directly
    const filePath = file;

    try {
      const content = await vaultFs.read(filePath);
      const { data, content: body } = parseFrontmatter(content);

      if (data.type !== "learning") continue;

      // Extract ID from filename (file is full relative path)
      const basename = file.split("/").pop() ?? file;
      const idMatch = basename.match(/^(\d+)-/);
      if (!idMatch) continue;

      // Extract title from first heading
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
    } catch {
      // Skip malformed files
    }
  }

  learnings.sort((a, b) => a.id.localeCompare(b.id));
  return learnings;
}
