import { VaultFS } from "../lib/vault-fs.js";
import { parseFrontmatter, serializeFrontmatter, createFrontmatter, mergeFrontmatter } from "../lib/frontmatter.js";
import { detectProject } from "../lib/project-detector.js";
import { validateProjectSlug } from "../config.js";
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
  vaultFs: VaultFS,
  vaultPath: string,
  options: {
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
  }
): Promise<{
  task_id?: string;
  path?: string;
  updated_fields?: string[];
  tasks?: TaskItem[];
  board?: Record<string, TaskItem[]>;
}> {
  let projectSlug = options.project ?? null;

  if (!projectSlug) {
    projectSlug = await detectProject(process.cwd(), vaultPath);
  }

  if (!projectSlug) {
    throw new Error("Could not detect project. Use --project <slug> to specify.");
  }
  validateProjectSlug(projectSlug);

  const tasksDir = `projects/${projectSlug}/tasks`;

  switch (options.action) {
    case "add": {
      if (!options.title) throw new Error("Title required for add");

      const nextNum = await getNextNumber(vaultFs, tasksDir);
      const padded = String(nextNum).padStart(3, "0");
      const titleSlug = slugify(options.title);
      const taskId = `task-${padded}`;
      const filename = `${taskId}-${titleSlug}.md`;
      const filePath = `${tasksDir}/${filename}`;

      const priority = options.priority ?? "p1";
      if (!VALID_TASK_PRIORITIES.includes(priority)) {
        throw new Error(`Invalid priority "${priority}". Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}`);
      }

      const fm = createFrontmatter({
        type: "task",
        project: projectSlug,
        status: "backlog",
        priority,
        blocked_by: options.blockedBy ?? [],
        assigned_to: options.assignedTo ?? "",
        sprint: options.sprint ?? "",
        tags: options.tags ?? [],
      });

      const body = `\n# ${options.title}\n`;
      await vaultFs.write(filePath, serializeFrontmatter(fm, body));

      return { task_id: taskId, path: filePath };
    }

    case "list": {
      const tasks = await listTasks(vaultFs, tasksDir);
      let filtered = tasks;

      if (options.status) {
        filtered = filtered.filter((t) => t.status === options.status);
      }
      if (options.priority) {
        filtered = filtered.filter((t) => t.priority === options.priority);
      }
      if (options.assignedTo) {
        filtered = filtered.filter((t) => t.assigned_to === options.assignedTo);
      }

      return { tasks: filtered };
    }

    case "update": {
      if (!options.taskId) throw new Error("Task ID required for update");

      const tasks = await listTasks(vaultFs, tasksDir);
      const task = tasks.find((t) => t.id === options.taskId);
      if (!task) throw new Error(`Task not found: ${options.taskId}`);

      const content = await vaultFs.read(task.path);
      const { data, content: body } = parseFrontmatter(content);
      const updatedFields: string[] = [];

      if (options.status) {
        if (!VALID_TASK_STATUSES.includes(options.status)) {
          throw new Error(`Invalid status "${options.status}". Must be one of: ${VALID_TASK_STATUSES.join(", ")}`);
        }
        data.status = options.status;
        updatedFields.push("status");
      }
      if (options.priority) {
        if (!VALID_TASK_PRIORITIES.includes(options.priority)) {
          throw new Error(`Invalid priority "${options.priority}". Must be one of: ${VALID_TASK_PRIORITIES.join(", ")}`);
        }
        data.priority = options.priority;
        updatedFields.push("priority");
      }
      if (options.blockedBy !== undefined) {
        data.blocked_by = options.blockedBy;
        updatedFields.push("blocked_by");
      }
      if (options.assignedTo !== undefined) {
        data.assigned_to = options.assignedTo;
        updatedFields.push("assigned_to");
      }
      if (options.title) {
        // Update title in body
        const newBody = body.replace(/^# .+$/m, `# ${options.title}`);
        const updated = mergeFrontmatter(data, {});
        await vaultFs.write(task.path, serializeFrontmatter(updated, newBody));
        updatedFields.push("title");
        return { task_id: options.taskId, updated_fields: updatedFields };
      }

      const updated = mergeFrontmatter(data, {});
      await vaultFs.write(task.path, serializeFrontmatter(updated, body));

      return { task_id: options.taskId, updated_fields: updatedFields };
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
      throw new Error(`Unknown action: ${options.action}`);
  }
}

async function listTasks(vaultFs: VaultFS, tasksDir: string): Promise<TaskItem[]> {
  const tasks: TaskItem[] = [];

  let files: string[];
  try {
    files = await vaultFs.list(tasksDir, 1);
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

      if (data.type !== "task") continue;

      // Extract task ID from filename (file is full relative path)
      const basename = file.split("/").pop() ?? file;
      const idMatch = basename.match(/^(task-\d+)/);
      if (!idMatch) continue;

      // Extract title from first heading
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
    } catch {
      // Skip malformed files
    }
  }

  // Sort by priority (p0 first) then by ID
  tasks.sort((a, b) => {
    const priOrder = VALID_TASK_PRIORITIES.indexOf(a.priority) - VALID_TASK_PRIORITIES.indexOf(b.priority);
    if (priOrder !== 0) return priOrder;
    return a.id.localeCompare(b.id);
  });

  return tasks;
}
