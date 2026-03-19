import type { CommandContext } from "../core/types.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter, mergeFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { escapeRegex } from "../lib/escape-regex.js";

export interface TodoItem {
  text: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
}

export async function todoCommand(
  args: {
    action: "list" | "add" | "complete" | "remove";
    item?: string;
    priority?: "high" | "medium" | "low";
    project?: string;
    blockersOnly?: boolean;
  },
  ctx: CommandContext,
): Promise<{ todos: TodoItem[] }> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);
  const vaultFs = ctx.vaultFs;

  const todoPath = `projects/${projectSlug}/todos.md`;
  const exists = await vaultFs.exists(todoPath);

  if (args.action === "list") {
    if (!exists) return { todos: [] };

    const content = await vaultFs.read(todoPath);
    const todos = parseTodos(content);

    if (args.blockersOnly) {
      return { todos: todos.filter((t) => t.priority === "high" && !t.completed) };
    }

    return { todos: todos.filter((t) => !t.completed) };
  }

  if (args.action === "add") {
    if (!args.item) throw new Error("Item text required for add");

    const priority = args.priority ?? "medium";
    const marker = priorityMarker(priority);
    const line = `- [ ] ${marker}${args.item}`;

    if (!exists) {
      const fm = createFrontmatter({ type: "todo", project: projectSlug });
      const body = `\n# Todos\n\n${line}\n`;
      const fullContent = serializeFrontmatter(fm, body);
      await vaultFs.write(todoPath, fullContent);
      return { todos: parseTodos(fullContent) };
    } else {
      const content = await vaultFs.read(todoPath);
      const { data, content: body } = parseFrontmatter(content);
      const updatedBody = body.trimEnd() + `\n${line}\n`;
      const updated = mergeFrontmatter(data, {});
      const fullContent = serializeFrontmatter(updated, updatedBody);
      await vaultFs.write(todoPath, fullContent);
      return { todos: parseTodos(fullContent) };
    }
  }

  if (args.action === "complete") {
    if (!args.item) throw new Error("Item text required for complete");
    if (!exists) throw new Error("No todos file found");

    const content = await vaultFs.read(todoPath);
    const updated = content.replace(
      new RegExp(`^- \\[ \\] (🔴 |🟡 |🟢 )?${escapeRegex(args.item)}$`, "m"),
      (match) => match.replace("- [ ]", "- [x]")
    );

    const { data, content: body } = parseFrontmatter(updated);
    const mergedFm = mergeFrontmatter(data, {});
    const finalContent = serializeFrontmatter(mergedFm, body);
    await vaultFs.write(todoPath, finalContent);
    return { todos: parseTodos(finalContent) };
  }

  if (args.action === "remove") {
    if (!args.item) throw new Error("Item text required for remove");
    if (!exists) throw new Error("No todos file found");

    const content = await vaultFs.read(todoPath);
    const { data, content: body } = parseFrontmatter(content);

    const escapedItem = escapeRegex(args.item);
    const removePattern = new RegExp(`^- \\[([ x])\\] (🔴 |🟡 |🟢 )?${escapedItem}$`);
    const bodyLines = body.split("\n");
    const filtered = bodyLines.filter((line) => !removePattern.test(line));

    const mergedFm = mergeFrontmatter(data, {});
    const updatedContent = serializeFrontmatter(mergedFm, filtered.join("\n"));
    await vaultFs.write(todoPath, updatedContent);
    return { todos: parseTodos(updatedContent) };
  }

  throw new Error(`Unknown action: ${args.action}`);
}

function parseTodos(content: string): TodoItem[] {
  const { content: body } = parseFrontmatter(content);
  const todos: TodoItem[] = [];

  for (const line of body.split("\n")) {
    const match = line.match(/^- \[([ x])\] (🔴 |🟡 |🟢 )?(.+)$/);
    if (match) {
      const completed = match[1] === "x";
      const priorityEmoji = match[2]?.trim();
      const text = match[3].trim();

      let priority: "high" | "medium" | "low" = "medium";
      if (priorityEmoji === "🔴") priority = "high";
      else if (priorityEmoji === "🟢") priority = "low";

      todos.push({ text, priority, completed });
    }
  }

  return todos;
}

function priorityMarker(priority: string): string {
  switch (priority) {
    case "high": return "🔴 ";
    case "low": return "🟢 ";
    default: return "🟡 ";
  }
}
