import type { CommandContext } from "../core/types.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter, mergeFrontmatter } from "../lib/frontmatter.js";
import { resolveProject } from "../config.js";
import { getNextNumber, slugify } from "../lib/auto-number.js";

export type TaskStatus = "backlog" | "in-progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "p0" | "p1" | "p2";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  blocked_by: string[];
  assigned_to: string;
  sprint: string;
  tags: string[];
  created: string;
  updated: string;
  path: string;
}

const VALID_TASK_STATUSES: TaskStatus[] = ["backlog", "in-progress", "blocked", "done", "cancelled"];
const VALID_TASK_PRIORITIES: TaskPriority[] = ["p0", "p1", "p2"];
const STATUS_COLUMNS: TaskStatus[] = ["backlog", "in-progress", "blocked", "done", "cancelled"];

export async function taskCommand(
  args: {
    action: "add" | "list" | "update" | "board";
    title?: string;
    taskId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    blockedBy?: string[];
    assignedTo?: string;
    sprint?: string;
    tags?: string[];
    project?: string;
  },
  ctx: CommandContext,
): Promise<{
  task_id?: string;
  path?: string;
  updated_fields?: string[];
  tasks?: TaskItem[];
  board?: Record<string, TaskItem[]>;
}> {
  const projectSlug = await resolveProject(ctx.vaultPath, args.project);
  const vaultFs = ctx.vaultFs;
  const tasksDir = `projects/${projectSlug}/tasks`;

  switch (args.action) {
    case "add": {
      if (!args.title) throw new Error("Title required for add");

      const nextNum = await getNextNumber(vaultFs, tasksDir);
      const padded = String(nextNum).padStart(3, "0");
      const titleSlug = slugify(args.title);
      const taskId = `task-${padded}`;
      const filename = `${taskId}-${titleSlug}.md`;
      const filePath = `${tasksDir}/${filename}`;

      const priority = args.priority ?? "p1";
      if (!VALID_TASK_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority "${priority}". Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}`);
      }

      const fm = createFrontmatter({
        type: "task",
        project: projectSlug,
        status: "backlog",
        priority,
        blocked_by: args.blockedBy ?? [],
        assigned_to: args.assignedTo ?? "",
        sprint: args.sprint ?? "",
        tags: args.tags ?? [],
      });

      const body = `\n# ${args.title}\n`;
      await vaultFs.write(filePath, serializeFrontmatter(fm, body));

      return { task_id: taskId, path: filePath };
    }

    case "list": {
      const tasks = await listTasks(vaultFs, tasksDir);
      let filtered = tasks;

      if (args.status) {
        filtered = filtered.filter((t) => t.status === args.status);
      }
      if (args.priority) {
        filtered = filtered.filter((t) => t.priority === args.priority);
      }
      if (args.assignedTo) {
        filtered = filtered.filter((t) => t.assigned_to === args.assignedTo);
      }

      return { tasks: filtered };
    }

    case "update": {
      if (!args.taskId) throw new Error("Task ID required for update");

      const tasks = await listTasks(vaultFs, tasksDir);
      const task = tasks.find((t) => t.id === args.taskId);
      if (!task) throw new Error(`Task not found: ${args.taskId}`);

      const content = await vaultFs.read(task.path);
      const { data, content: body } = parseFrontmatter(content);
      const updatedFields: string[] = [];

      if (args.status) {
        if (!VALID_TASK_STATUSES.includes(args.status)) {
          throw new Error(`Invalid status "${args.status}". Must be one of: ${VALID_TASK_STATUSES.join(", ")}`);
        }
        data.status = args.status;
        updatedFields.push("status");
      }
      if (args.priority) {
        if (!VALID_TASK_PRIORITIES.includes(args.priority)) {
          throw new Error(`Invalid priority "${args.priority}". Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}`);
        }
        data.priority = args.priority;
        updatedFields.push("priority");
      }
      if (args.blockedBy !== undefined) {
        data.blocked_by = args.blockedBy;
        updatedFields.push("blocked_by");
      }
      if (args.assignedTo !== undefined) {
        data.assigned_to = args.assignedTo;
        updatedFields.push("assigned_to");
      }
      if (args.title) {
        const newBody = body.replace(/^# .+$/m, `# ${args.title}`);
        const updated = mergeFrontmatter(data, {});
        await vaultFs.write(task.path, serializeFrontmatter(updated, newBody));
        updatedFields.push("title");
        return { task_id: args.taskId, updated_fields: updatedFields };
      }

      const updated = mergeFrontmatter(data, {});
      await vaultFs.write(task.path, serializeFrontmatter(updated, body));

      return { task_id: args.taskId, updated_fields: updatedFields };
    }

    case "board": {
      const tasks = await listTasks(vaultFs, tasksDir);
      const board: Record<string, TaskItem[]> = {};

      for (const col of STATUS_COLUMNS) {
        board[col] = tasks.filter((t) => t.status === col);
      }

      return { board };
    }

    default:
      throw new Error(`Unknown action: ${args.action}`);
  }
}

async function listTasks(vaultFs: import("../lib/vault-fs.js").VaultFS, tasksDir: string): Promise<TaskItem[]> {
  const tasks: TaskItem[] = [];

  let files: string[];
  try {
    files = await vaultFs.list(tasksDir, 1);
  } catch {
    return [];
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const filePath = file;

    try {
      const content = await vaultFs.read(filePath);
      const { data, content: body } = parseFrontmatter(content);

      if (data.type !== "task") continue;

      const basename = file.split("/").pop() ?? file;
      const idMatch = basename.match(/^(task-\d+)/);
      if (!idMatch) continue;

      const titleMatch = body.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file;

      tasks.push({
        id: idMatch[1],
        title,
        status: (data.status as TaskStatus) ?? "backlog",
        priority: (data.priority as TaskPriority) ?? "p1",
        blocked_by: Array.isArray(data.blocked_by) ? data.blocked_by as string[] : [],
        assigned_to: (data.assigned_to as string) ?? "",
        sprint: (data.sprint as string) ?? "",
        tags: Array.isArray(data.tags) ? data.tags as string[] : [],
        created: (data.created as string) ?? "",
        updated: (data.updated as string) ?? "",
        path: filePath,
      });
    } catch (e: unknown) {
      if (e instanceof Error && "code" in e && (e as any).code !== "ENOENT") {
        console.error("[task] Skipping unreadable task file:", e instanceof Error ? e.message : e);
      }
    }
  }

  tasks.sort((a, b) => {
    const priOrder = VALID_TASK_PRIORITIES.indexOf(a.priority) - VALID_TASK_PRIORITIES.indexOf(b.priority);
    if (priOrder !== 0) return priOrder;
    return a.id.localeCompare(b.id);
  });

  return tasks;
}
