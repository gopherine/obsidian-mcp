// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, writeFile, mkdir, rename } from "fs/promises";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

// ── Types ────────────────────────────────────────────

export type MatchMethod = "trigger" | "skill_id" | "domain" | "web_discovery";

export interface Activation {
  skill_id: string;
  match_method: MatchMethod;
  timestamp: string;
  task_query: string;
  matched: boolean;
}

export interface FailedSearch {
  query: string;
  timestamp: string;
  result_count: number;
}

export interface SkillUsageCount {
  id: string;
  count: number;
}

export interface AnalyticsSummary {
  total_activations: number;
  total_failed_searches: number;
  most_used_skills: SkillUsageCount[];
  first_seen: string | null;
  last_seen: string | null;
}

export interface AnalyticsData {
  activations: Activation[];
  failed_searches: FailedSearch[];
  summary: AnalyticsSummary;
}

// ── Constants ────────────────────────────────────────

const MAX_ACTIVATIONS = 1000;
const MAX_FAILED_SEARCHES = 1000;
const ANALYTICS_DIR = resolve(
  process.env.HOME ?? process.env.USERPROFILE ?? tmpdir(),
  ".superskill",
);
const ANALYTICS_PATH = resolve(ANALYTICS_DIR, "analytics.json");

/** Override path for testing. */
let analyticsPathOverride: string | null = null;

export function setAnalyticsPath(path: string | null): void {
  analyticsPathOverride = path;
}

function getAnalyticsPath(): string {
  return analyticsPathOverride ?? ANALYTICS_PATH;
}

// ── Storage ──────────────────────────────────────────

function emptyData(): AnalyticsData {
  return {
    activations: [],
    failed_searches: [],
    summary: {
      total_activations: 0,
      total_failed_searches: 0,
      most_used_skills: [],
      first_seen: null,
      last_seen: null,
    },
  };
}

async function readAnalytics(): Promise<AnalyticsData> {
  try {
    const raw = await readFile(getAnalyticsPath(), "utf-8");
    const data = JSON.parse(raw) as Partial<AnalyticsData>;
    return {
      activations: Array.isArray(data.activations) ? data.activations : [],
      failed_searches: Array.isArray(data.failed_searches) ? data.failed_searches : [],
      summary: data.summary ?? emptyData().summary,
    };
  } catch {
    return emptyData();
  }
}

function computeSummary(data: AnalyticsData): AnalyticsSummary {
  const counts = new Map<string, number>();
  for (const a of data.activations) {
    counts.set(a.skill_id, (counts.get(a.skill_id) ?? 0) + 1);
  }

  const most_used_skills = Array.from(counts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const allTimestamps = [
    ...data.activations.map((a) => a.timestamp),
    ...data.failed_searches.map((f) => f.timestamp),
  ].filter(Boolean).sort();

  return {
    total_activations: data.activations.length,
    total_failed_searches: data.failed_searches.length,
    most_used_skills,
    first_seen: allTimestamps[0] ?? null,
    last_seen: allTimestamps[allTimestamps.length - 1] ?? null,
  };
}

function rotateIfNeeded(data: AnalyticsData): void {
  if (data.activations.length > MAX_ACTIVATIONS) {
    data.activations = data.activations.slice(-MAX_ACTIVATIONS);
  }
  if (data.failed_searches.length > MAX_FAILED_SEARCHES) {
    data.failed_searches = data.failed_searches.slice(-MAX_FAILED_SEARCHES);
  }
}

async function writeAnalytics(data: AnalyticsData): Promise<void> {
  const filePath = getAnalyticsPath();
  await mkdir(dirname(filePath), { recursive: true });

  // Atomic write: write to temp file, then rename
  const tempPath = filePath + "." + randomBytes(6).toString("hex") + ".tmp";
  const json = JSON.stringify(data, null, 2);
  await writeFile(tempPath, json, "utf-8");
  await rename(tempPath, filePath);
}

// ── Public API ───────────────────────────────────────

/**
 * Track a skill activation event.
 * Never throws — analytics failures must not block skill activation.
 */
export async function trackActivation(activation: Omit<Activation, "timestamp">): Promise<void> {
  try {
    const data = await readAnalytics();
    data.activations.push({
      ...activation,
      timestamp: new Date().toISOString(),
    });
    rotateIfNeeded(data);
    data.summary = computeSummary(data);
    await writeAnalytics(data);
  } catch {
    // Never crash — analytics failure must never block skill activation
  }
}

/**
 * Track a failed search event.
 * Never throws — analytics failures must not block skill activation.
 */
export async function trackFailedSearch(query: string, resultCount: number = 0): Promise<void> {
  try {
    const data = await readAnalytics();
    data.failed_searches.push({
      query,
      timestamp: new Date().toISOString(),
      result_count: resultCount,
    });
    rotateIfNeeded(data);
    data.summary = computeSummary(data);
    await writeAnalytics(data);
  } catch {
    // Never crash — analytics failure must never block skill activation
  }
}

/**
 * Track a web discovery activation (convenience wrapper).
 * Never throws.
 */
export async function trackWebDiscovery(taskQuery: string, matched: boolean): Promise<void> {
  try {
    await trackActivation({
      skill_id: "web_discovery",
      match_method: "web_discovery",
      task_query: taskQuery,
      matched,
    });
  } catch {
    // Never crash
  }
}

/**
 * Get the current analytics summary.
 * Never throws — returns empty summary on failure.
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  try {
    const data = await readAnalytics();
    return computeSummary(data);
  } catch {
    return emptyData().summary;
  }
}

/**
 * Get the full analytics data (for debugging / display).
 * Never throws — returns empty data on failure.
 */
export async function getAnalyticsData(): Promise<AnalyticsData> {
  try {
    return await readAnalytics();
  } catch {
    return emptyData();
  }
}
