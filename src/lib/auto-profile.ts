// SPDX-License-Identifier: AGPL-3.0-or-later
import { detectStack } from "./stack-detector.js";
import { detectTool } from "./tool-detector.js";
import type { DetectedStack } from "./stack-detector.js";
import type { DetectedTool } from "./tool-detector.js";

// All known domains from the catalog
const ALL_DOMAINS = [
  "tdd", "planning", "code-review", "verification", "agent-orchestration",
  "security", "shipping", "debugging", "brainstorming", "frontend-design",
  "3d-animation", "meta", "go", "python", "django", "spring-boot", "swift",
  "cpp", "java", "database", "git-workflow", "api-design", "backend-patterns",
  "agent-engineering", "content-business", "docker", "frontend-patterns",
  "coding-standards",
];

// Base domains that are always included
const BASE_DOMAINS = [
  "tdd", "code-review", "verification", "planning", "security", "debugging",
  "meta", "git-workflow", "agent-orchestration", "agent-engineering",
  "brainstorming", "shipping",
];

export function getRelevantDomains(stack: DetectedStack): string[] {
  const { languages, frameworks, primary } = stack;

  // No specific stack detected → return all domains (no filtering)
  if (primary === "unknown" && languages.length === 0 && frameworks.length === 0) {
    return [...ALL_DOMAINS];
  }

  const domains = new Set<string>(BASE_DOMAINS);

  // Go detected
  if (languages.includes("go") || primary === "go") {
    domains.add("go");
    domains.add("api-design");
    domains.add("backend-patterns");
  }

  // Python detected
  if (languages.includes("python") || primary === "python") {
    domains.add("python");
  }

  // Django detected
  if (frameworks.includes("django")) {
    domains.add("django");
    domains.add("database");
  }

  // Spring Boot detected
  if (frameworks.includes("spring-boot")) {
    domains.add("spring-boot");
    domains.add("java");
    domains.add("database");
  }

  // Frontend frameworks detected
  const frontendFrameworks = ["react", "next", "vue", "angular"];
  const hasFrontend = frontendFrameworks.some((fw) => frameworks.includes(fw));
  if (hasFrontend) {
    domains.add("frontend-design");
    domains.add("3d-animation");
  }

  // Swift detected
  if (languages.includes("swift") || primary === "swift") {
    domains.add("swift");
  }

  // C++ detected
  if (languages.includes("cpp") || primary === "cpp") {
    domains.add("cpp");
  }

  // Java detected (non-Spring)
  if ((languages.includes("java") || primary === "java") && !frameworks.includes("spring-boot")) {
    domains.add("java");
  }

  // content-business: only when no specific tech stack detected
  const hasSpecificStack =
    languages.length > 0 && primary !== "unknown";
  if (!hasSpecificStack) {
    domains.add("content-business");
  }

  return [...domains];
}

export interface AutoConfig {
  profile: string;
  size: 'compact' | 'standard' | 'full';
  reason: string;
  detectedStack: DetectedStack;
  detectedTool: DetectedTool;
}

function selectProfile(stack: DetectedStack): string {
  const { languages, frameworks, primary } = stack;

  // Framework-specific overrides
  if (frameworks.includes("django") || frameworks.includes("spring-boot")) {
    return "ecc-first";
  }

  // Primary language selection
  if (primary === "go" || primary === "python") {
    return "ecc-first";
  }

  // TypeScript/JavaScript with React
  if (
    (languages.includes("typescript") || languages.includes("javascript")) &&
    frameworks.includes("react")
  ) {
    return "ecc-first";
  }

  // Any other known language → ecc-first (ECC has broad language support)
  if (primary !== "unknown" && languages.length > 0) {
    return "ecc-first";
  }

  // Unknown / mixed / no recognisable stack → methodology-focused
  return "superpowers-first";
}

function selectSize(contextWindow: number | undefined): 'compact' | 'standard' | 'full' {
  const ctx = contextWindow ?? 128_000;
  if (ctx >= 500_000) return "full";
  if (ctx >= 100_000) return "standard";
  return "compact";
}

function buildReason(stack: DetectedStack, tool: DetectedTool, profile: string, size: string): string {
  const stackDesc = stack.primary !== "unknown"
    ? [stack.primary, ...stack.frameworks].join(" + ")
    : "unknown stack";
  const toolDesc = tool.tool !== "unknown"
    ? `${tool.tool}${tool.model ? ` (${tool.model})` : ""}`
    : "unknown tool";
  return `${stackDesc} project on ${toolDesc} → ${profile}, ${size}`;
}

export async function autoDetect(projectPath?: string): Promise<AutoConfig> {
  const cwd = projectPath ?? process.cwd();

  const [detectedStack, detectedTool] = await Promise.all([
    detectStack(cwd),
    Promise.resolve(detectTool()),
  ]);

  const profile = selectProfile(detectedStack);
  const size = selectSize(detectedTool.contextWindow);
  const reason = buildReason(detectedStack, detectedTool, profile, size);

  return { profile, size, reason, detectedStack, detectedTool };
}
