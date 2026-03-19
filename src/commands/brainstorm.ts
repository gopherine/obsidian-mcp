import type { CommandContext } from "../core/types.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter, mergeFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { slugify } from "../lib/auto-number.js";

export async function brainstormCommand(
  args: {
    topic: string;
    content: string;
    project?: string;
  },
  ctx: CommandContext,
): Promise<{ path: string; total_entries: number }> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);

  const slug = slugify(args.topic);
  const filePath = `projects/${projectSlug}/brainstorms/${slug}.md`;
  const today = new Date().toISOString().slice(0, 10);

  const exists = await ctx.vaultFs.exists(filePath);

  if (!exists) {
    const fm = createFrontmatter({
      type: "brainstorm",
      project: projectSlug,
      status: "draft",
    });

    const body = `
# ${args.topic}

## Entries

### ${today}

${args.content}
`.trimStart();

    await ctx.vaultFs.write(filePath, serializeFrontmatter(fm, body));
    return { path: filePath, total_entries: 1 };
  }

  const existing = await ctx.vaultFs.read(filePath);
  const { data, content: body } = parseFrontmatter(existing);

  const newEntry = `\n### ${today}\n\n${args.content}\n`;
  const updatedBody = body.trimEnd() + "\n" + newEntry;
  const updatedFm = mergeFrontmatter(data, {});

  await ctx.vaultFs.write(filePath, serializeFrontmatter(updatedFm, updatedBody));

  const entryCount = (updatedBody.match(/^### /gm) ?? []).length;

  return { path: filePath, total_entries: entryCount };
}
