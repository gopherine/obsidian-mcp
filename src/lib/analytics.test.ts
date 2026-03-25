// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";
import {
  trackActivation,
  trackFailedSearch,
  trackWebDiscovery,
  getAnalyticsSummary,
  getAnalyticsData,
  setAnalyticsPath,
  type AnalyticsData,
} from "./analytics.js";

let tempDir: string;
let analyticsPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "analytics-test-"));
  analyticsPath = resolve(tempDir, "analytics.json");
  setAnalyticsPath(analyticsPath);
});

afterEach(async () => {
  setAnalyticsPath(null);
  await rm(tempDir, { recursive: true, force: true });
});

describe("trackActivation", () => {
  it("writes activation to file", async () => {
    await trackActivation({
      skill_id: "ecc/tdd-workflow",
      match_method: "trigger",
      task_query: "write tests",
      matched: true,
    });

    const raw = await readFile(analyticsPath, "utf-8");
    const data: AnalyticsData = JSON.parse(raw);
    expect(data.activations).toHaveLength(1);
    expect(data.activations[0].skill_id).toBe("ecc/tdd-workflow");
    expect(data.activations[0].match_method).toBe("trigger");
    expect(data.activations[0].task_query).toBe("write tests");
    expect(data.activations[0].matched).toBe(true);
    expect(data.activations[0].timestamp).toBeTruthy();
  });

  it("appends multiple activations", async () => {
    await trackActivation({
      skill_id: "ecc/tdd-workflow",
      match_method: "trigger",
      task_query: "write tests",
      matched: true,
    });
    await trackActivation({
      skill_id: "ecc/code-review",
      match_method: "domain",
      task_query: "review my code",
      matched: true,
    });

    const data = await getAnalyticsData();
    expect(data.activations).toHaveLength(2);
    expect(data.activations[0].skill_id).toBe("ecc/tdd-workflow");
    expect(data.activations[1].skill_id).toBe("ecc/code-review");
  });
});

describe("trackFailedSearch", () => {
  it("writes failed search to file", async () => {
    await trackFailedSearch("CPO product management", 0);

    const raw = await readFile(analyticsPath, "utf-8");
    const data: AnalyticsData = JSON.parse(raw);
    expect(data.failed_searches).toHaveLength(1);
    expect(data.failed_searches[0].query).toBe("CPO product management");
    expect(data.failed_searches[0].result_count).toBe(0);
    expect(data.failed_searches[0].timestamp).toBeTruthy();
  });
});

describe("trackWebDiscovery", () => {
  it("records a web discovery activation", async () => {
    await trackWebDiscovery("build a flutter app", true);

    const data = await getAnalyticsData();
    expect(data.activations).toHaveLength(1);
    expect(data.activations[0].skill_id).toBe("web_discovery");
    expect(data.activations[0].match_method).toBe("web_discovery");
    expect(data.activations[0].matched).toBe(true);
  });
});

describe("getAnalyticsSummary", () => {
  it("returns correct summary", async () => {
    await trackActivation({ skill_id: "a/skill-1", match_method: "trigger", task_query: "t1", matched: true });
    await trackActivation({ skill_id: "a/skill-1", match_method: "trigger", task_query: "t2", matched: true });
    await trackActivation({ skill_id: "b/skill-2", match_method: "domain", task_query: "t3", matched: true });
    await trackFailedSearch("something missing", 0);

    const summary = await getAnalyticsSummary();
    expect(summary.total_activations).toBe(3);
    expect(summary.total_failed_searches).toBe(1);
    expect(summary.most_used_skills[0]).toEqual({ id: "a/skill-1", count: 2 });
    expect(summary.most_used_skills[1]).toEqual({ id: "b/skill-2", count: 1 });
    expect(summary.first_seen).toBeTruthy();
    expect(summary.last_seen).toBeTruthy();
  });

  it("returns empty summary when no data exists", async () => {
    const summary = await getAnalyticsSummary();
    expect(summary.total_activations).toBe(0);
    expect(summary.total_failed_searches).toBe(0);
    expect(summary.most_used_skills).toEqual([]);
    expect(summary.first_seen).toBeNull();
    expect(summary.last_seen).toBeNull();
  });
});

describe("file rotation", () => {
  it("rotates activations at 1000 entries", async () => {
    // Seed the file with 1001 activations directly
    const activations = Array.from({ length: 1001 }, (_, i) => ({
      skill_id: `skill-${i}`,
      match_method: "trigger" as const,
      timestamp: new Date(Date.now() - (1001 - i) * 1000).toISOString(),
      task_query: `task ${i}`,
      matched: true,
    }));

    const data: AnalyticsData = {
      activations,
      failed_searches: [],
      summary: { total_activations: 1001, total_failed_searches: 0, most_used_skills: [], first_seen: null, last_seen: null },
    };

    const { writeFile: wf, mkdir: mk } = await import("fs/promises");
    const { dirname } = await import("path");
    await mk(dirname(analyticsPath), { recursive: true });
    await wf(analyticsPath, JSON.stringify(data), "utf-8");

    // Now track one more — should trigger rotation
    await trackActivation({ skill_id: "new-skill", match_method: "trigger", task_query: "new task", matched: true });

    const result = await getAnalyticsData();
    expect(result.activations.length).toBeLessThanOrEqual(1000);
    // The newest entry should be present
    expect(result.activations[result.activations.length - 1].skill_id).toBe("new-skill");
    // The oldest entries should have been dropped
    expect(result.activations[0].skill_id).not.toBe("skill-0");
  });
});

describe("error resilience", () => {
  it("never throws on write failure", async () => {
    // Point to an invalid path that can't be created
    setAnalyticsPath("/dev/null/impossible/path/analytics.json");

    // These should all silently succeed (no throw)
    await expect(
      trackActivation({ skill_id: "test", match_method: "trigger", task_query: "t", matched: true }),
    ).resolves.toBeUndefined();

    await expect(
      trackFailedSearch("test query"),
    ).resolves.toBeUndefined();

    await expect(
      trackWebDiscovery("test", false),
    ).resolves.toBeUndefined();
  });

  it("returns empty summary on read failure", async () => {
    setAnalyticsPath("/dev/null/impossible/path/analytics.json");
    const summary = await getAnalyticsSummary();
    expect(summary.total_activations).toBe(0);
  });
});
