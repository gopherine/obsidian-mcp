// SPDX-License-Identifier: AGPL-3.0-or-later
import { access, readFile } from "fs/promises";
import { join } from "path";

export interface DetectedStack {
  languages: string[];   // e.g. ['go', 'typescript']
  frameworks: string[];  // e.g. ['echo', 'react']
  buildTools: string[];  // e.g. ['make', 'bun']
  primary: string;       // most dominant language, or 'unknown'
}

// Marker → language mapping (ordered: first hit wins for primary)
const LANGUAGE_MARKERS: Array<{ file: string; language: string }> = [
  { file: "go.mod", language: "go" },
  { file: "Cargo.toml", language: "rust" },
  { file: "Package.swift", language: "swift" },
  { file: "pom.xml", language: "java" },
  { file: "build.gradle", language: "java" },
  { file: "Gemfile", language: "ruby" },
  { file: "pyproject.toml", language: "python" },
  { file: "requirements.txt", language: "python" },
  { file: "package.json", language: "typescript" },
  { file: "CMakeLists.txt", language: "cpp" },
  { file: "Makefile", language: "_makefile" }, // handled specially for cpp
];

const BUILD_TOOL_MARKERS: Array<{ file: string; tool: string }> = [
  { file: "Makefile", tool: "make" },
  { file: "bun.lockb", tool: "bun" },
  { file: "yarn.lock", tool: "yarn" },
  { file: "pnpm-lock.yaml", tool: "pnpm" },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function detectGoFrameworks(projectPath: string): Promise<string[]> {
  const content = await readFileSafe(join(projectPath, "go.mod"));
  if (!content) return [];
  const frameworks: string[] = [];
  if (/labstack\/echo/.test(content)) frameworks.push("echo");
  if (/gin-gonic\/gin/.test(content)) frameworks.push("gin");
  if (/gofiber\/fiber/.test(content)) frameworks.push("fiber");
  return frameworks;
}

async function detectNodeFrameworks(projectPath: string): Promise<string[]> {
  const content = await readFileSafe(join(projectPath, "package.json"));
  if (!content) return [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content);
  } catch {
    return [];
  }
  const deps = {
    ...(typeof pkg.dependencies === "object" && pkg.dependencies !== null ? pkg.dependencies as Record<string, string> : {}),
    ...(typeof pkg.devDependencies === "object" && pkg.devDependencies !== null ? pkg.devDependencies as Record<string, string> : {}),
  };
  const frameworks: string[] = [];
  if ("react" in deps || "react-dom" in deps) frameworks.push("react");
  if ("next" in deps) frameworks.push("next");
  if ("vue" in deps) frameworks.push("vue");
  if ("@angular/core" in deps) frameworks.push("angular");
  return frameworks;
}

async function detectPythonFrameworks(projectPath: string): Promise<string[]> {
  const sources = [
    await readFileSafe(join(projectPath, "pyproject.toml")),
    await readFileSafe(join(projectPath, "requirements.txt")),
  ];
  const combined = sources.filter(Boolean).join("\n");
  const frameworks: string[] = [];
  if (/django/i.test(combined)) frameworks.push("django");
  if (/flask/i.test(combined)) frameworks.push("flask");
  if (/fastapi/i.test(combined)) frameworks.push("fastapi");
  return frameworks;
}

async function detectJavaFrameworks(projectPath: string): Promise<string[]> {
  const sources = [
    await readFileSafe(join(projectPath, "pom.xml")),
    await readFileSafe(join(projectPath, "build.gradle")),
  ];
  const combined = sources.filter(Boolean).join("\n");
  const frameworks: string[] = [];
  if (
    /spring-boot/i.test(combined) ||
    /spring\.boot/i.test(combined) ||
    /org\.springframework\.boot/i.test(combined)
  ) {
    frameworks.push("spring-boot");
  }
  return frameworks;
}

async function detectRubyFrameworks(projectPath: string): Promise<string[]> {
  const content = await readFileSafe(join(projectPath, "Gemfile"));
  if (!content) return [];
  const frameworks: string[] = [];
  if (/gem\s+['"]rails['"]/i.test(content)) frameworks.push("rails");
  return frameworks;
}

async function detectCppFromMakefile(projectPath: string): Promise<boolean> {
  // A Makefile alone doesn't mean C++ — look for .cpp files nearby
  const content = await readFileSafe(join(projectPath, "Makefile"));
  if (!content) return false;
  return /\.cpp|\.cc|\.cxx|g\+\+|clang\+\+/i.test(content);
}

export async function detectStack(projectPath: string): Promise<DetectedStack> {
  const languages = new Set<string>();
  const frameworks: string[] = [];
  const buildTools: string[] = [];

  // Check language markers in parallel
  const markerChecks = await Promise.all(
    LANGUAGE_MARKERS.map(async (m) => ({
      ...m,
      present: await fileExists(join(projectPath, m.file)),
    }))
  );

  // Check build tools in parallel
  const buildToolChecks = await Promise.all(
    BUILD_TOOL_MARKERS.map(async (m) => ({
      ...m,
      present: await fileExists(join(projectPath, m.file)),
    }))
  );

  for (const check of buildToolChecks) {
    if (check.present) buildTools.push(check.tool);
  }

  let hasMakefile = false;
  for (const check of markerChecks) {
    if (!check.present) continue;

    if (check.language === "_makefile") {
      hasMakefile = true;
      continue; // handled after loop
    }
    languages.add(check.language);
  }

  if (hasMakefile) {
    const isCpp = await detectCppFromMakefile(projectPath);
    if (isCpp) languages.add("cpp");
    // Make sure 'make' is in buildTools (may already be added from BUILD_TOOL_MARKERS)
    if (!buildTools.includes("make")) buildTools.push("make");
  }

  // Detect frameworks for each language found
  const frameworkResults = await Promise.all([
    languages.has("go") ? detectGoFrameworks(projectPath) : Promise.resolve([]),
    languages.has("typescript") ? detectNodeFrameworks(projectPath) : Promise.resolve([]),
    languages.has("python") ? detectPythonFrameworks(projectPath) : Promise.resolve([]),
    languages.has("java") ? detectJavaFrameworks(projectPath) : Promise.resolve([]),
    languages.has("ruby") ? detectRubyFrameworks(projectPath) : Promise.resolve([]),
  ]);

  for (const fws of frameworkResults) {
    frameworks.push(...fws);
  }

  // Primary language: prefer languages with a "definitive" marker
  // Order: go > rust > swift > java > ruby > python > cpp > typescript
  const PRIMARY_ORDER = ["go", "rust", "swift", "java", "ruby", "python", "cpp", "typescript"];
  const primary =
    PRIMARY_ORDER.find((lang) => languages.has(lang)) ??
    (languages.size > 0 ? [...languages][0] : "unknown");

  return {
    languages: [...languages],
    frameworks,
    buildTools,
    primary,
  };
}
