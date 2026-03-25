// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, readdir } from "fs/promises";
import { join, basename } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { safeExternalPath } from "../lib/safe-external-path.js";

const execFileAsync = promisify(execFile);

interface InitResult {
  draft_context_md: string;
  detected_tech_stack: string[];
  slug: string;
}

interface FileProbe {
  name: string;
  exists: boolean;
  content?: string;
}

const MANIFEST_FILES = [
  "README.md", "AGENTS.md", "CLAUDE.md",
  "go.mod", "Cargo.toml", "package.json", "pyproject.toml",
  "requirements.txt", "Makefile", "Dockerfile", "docker-compose.yml",
];

/**
 * Scan a git repo and generate a draft context.md.
 * Does NOT write to vault — returns the draft as a string.
 */
export async function initCommand(
  projectPath: string,
  slug?: string,
): Promise<InitResult> {
  const resolved = await safeExternalPath(projectPath);
  const projectSlug = slug ?? basename(resolved).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Probe manifest files
  const probes: FileProbe[] = [];
  for (const name of MANIFEST_FILES) {
    try {
      const content = await readFile(join(resolved, name), "utf-8");
      probes.push({ name, exists: true, content });
    } catch {
      probes.push({ name, exists: false });
    }
  }

  // Detect tech stack
  const techStack = detectTechStack(probes);

  // Extract description from README
  const readme = probes.find((p) => p.name === "README.md" && p.exists);
  const description = readme ? extractDescription(readme.content!) : "No README found.";

  // Check for AI instructions
  const hasAgentsMd = probes.some((p) => p.name === "AGENTS.md" && p.exists);
  const hasClaudeMd = probes.some((p) => p.name === "CLAUDE.md" && p.exists);

  // Git log (5s timeout)
  let recentActivity = "No git history available.";
  try {
    const { stdout } = await execFileAsync("git", ["log", "--oneline", "-20"], {
      cwd: resolved,
      timeout: 5000,
    });
    recentActivity = stdout.trim() || "No commits yet.";
  } catch {
    // git log failed, use default
  }

  // Git remote
  let repoUrl = "";
  try {
    const { stdout } = await execFileAsync("git", ["remote", "-v"], {
      cwd: resolved,
      timeout: 3000,
    });
    const match = stdout.match(/origin\s+(\S+)\s+\(fetch\)/);
    if (match) repoUrl = match[1];
  } catch {
    // no remote
  }

  // Detect project structure
  const structure = await detectStructure(resolved);

  // Detect key files
  const keyFiles = probes
    .filter((p) => p.exists)
    .map((p) => p.name);

  // AI instructions note
  const aiInstructions: string[] = [];
  if (hasAgentsMd) aiInstructions.push("AGENTS.md present");
  if (hasClaudeMd) aiInstructions.push("CLAUDE.md present");

  // Build draft
  const today = new Date().toISOString().slice(0, 10);
  const draft = `---
type: context
project: ${projectSlug}
status: active
created: ${today}
updated: ${today}
tags: []
---

# ${projectSlug}

## What It Is

${description}

## Current State

${structure}${repoUrl ? `\nRepository: ${repoUrl}` : ""}${aiInstructions.length > 0 ? `\nAI Instructions: ${aiInstructions.join(", ")}` : ""}

## Tech Stack

${techStack.map((t) => `- ${t}`).join("\n")}

## Key Files

${keyFiles.map((f) => `- \`${f}\``).join("\n")}

## Recent Activity

\`\`\`
${recentActivity}
\`\`\`
`;

  return { draft_context_md: draft, detected_tech_stack: techStack, slug: projectSlug };
}

function detectTechStack(probes: FileProbe[]): string[] {
  const stack: string[] = [];

  const goMod = probes.find((p) => p.name === "go.mod" && p.exists);
  if (goMod) {
    stack.push("Go");
    const content = goMod.content!;
    if (content.includes("gin-gonic")) stack.push("Gin");
    if (content.includes("fiber")) stack.push("Fiber");
    if (content.includes("echo")) stack.push("Echo");
    if (content.includes("sqlc")) stack.push("sqlc");
    if (content.includes("pgx") || content.includes("lib/pq")) stack.push("PostgreSQL");
  }

  const cargo = probes.find((p) => p.name === "Cargo.toml" && p.exists);
  if (cargo) {
    stack.push("Rust");
    const content = cargo.content!;
    if (content.includes("actix")) stack.push("Actix");
    if (content.includes("axum")) stack.push("Axum");
    if (content.includes("tokio")) stack.push("Tokio");
    if (content.includes("serde")) stack.push("Serde");
  }

  const packageJson = probes.find((p) => p.name === "package.json" && p.exists);
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson.content!);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["next"]) stack.push("Next.js");
      else if (allDeps["react"]) stack.push("React");
      if (allDeps["vue"]) stack.push("Vue");
      if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) stack.push("Svelte");
      if (allDeps["express"]) stack.push("Express");
      if (allDeps["typescript"]) stack.push("TypeScript");
      if (allDeps["tailwindcss"]) stack.push("Tailwind CSS");
      if (allDeps["prisma"] || allDeps["@prisma/client"]) stack.push("Prisma");
      if (allDeps["drizzle-orm"]) stack.push("Drizzle");
      if (!stack.some((s) => ["Next.js", "React", "Vue", "Svelte", "Express"].includes(s))) {
        stack.push("Node.js");
      }
    } catch {
      stack.push("Node.js");
    }
  }

  const pyproject = probes.find((p) => p.name === "pyproject.toml" && p.exists);
  const requirements = probes.find((p) => p.name === "requirements.txt" && p.exists);
  if (pyproject || requirements) {
    stack.push("Python");
    const content = (pyproject?.content ?? "") + (requirements?.content ?? "");
    if (content.includes("fastapi")) stack.push("FastAPI");
    if (content.includes("django")) stack.push("Django");
    if (content.includes("flask")) stack.push("Flask");
    if (content.includes("groq")) stack.push("Groq");
    if (content.includes("openai")) stack.push("OpenAI");
    if (content.includes("graphql") || content.includes("strawberry") || content.includes("ariadne")) stack.push("GraphQL");
  }

  const dockerfile = probes.find((p) => p.name === "Dockerfile" && p.exists);
  if (dockerfile) stack.push("Docker");

  const dockerCompose = probes.find((p) => p.name === "docker-compose.yml" && p.exists);
  if (dockerCompose) {
    stack.push("Docker Compose");
    const content = dockerCompose.content!;
    if (content.includes("postgres")) stack.push("PostgreSQL");
    if (content.includes("redis")) stack.push("Redis");
    if (content.includes("mongo")) stack.push("MongoDB");
  }

  const makefile = probes.find((p) => p.name === "Makefile" && p.exists);
  if (makefile) stack.push("Make");

  return [...new Set(stack)];
}

function extractDescription(readme: string): string {
  const lines = readme.split("\n");
  let foundHeading = false;
  const paragraphLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundHeading = true;
      continue;
    }
    if (foundHeading) {
      if (line.trim() === "" && paragraphLines.length === 0) continue;
      if (line.startsWith("## ") || line.startsWith("# ")) break;
      if (line.trim() === "" && paragraphLines.length > 0) break;
      paragraphLines.push(line);
    }
  }

  const desc = paragraphLines.join(" ").trim();
  if (desc.length > 500) return desc.slice(0, 500) + "...";
  return desc || "No description available.";
}

async function detectStructure(projectPath: string): Promise<string> {
  try {
    const entries = await readdir(projectPath, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);

    const hasFrontend = dirs.some((d) => ["frontend", "web", "client", "app"].includes(d));
    const hasBackend = dirs.some((d) => ["backend", "server", "api", "cmd", "internal"].includes(d));
    const hasPackages = dirs.some((d) => ["packages", "libs", "crates", "modules"].includes(d));

    if (hasPackages) return "Monorepo structure";
    if (hasFrontend && hasBackend) return "Full-stack (frontend + backend)";
    if (dirs.includes("cmd") && dirs.includes("internal")) return "Go project structure (cmd + internal)";
    if (dirs.length > 10) return `Large project (${dirs.length} top-level directories)`;

    return `Single project (top-level dirs: ${dirs.slice(0, 8).join(", ")})`;
  } catch {
    return "Structure unknown";
  }
}
