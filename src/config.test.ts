import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { homedir } from "os";
import { validateProjectSlug, loadConfig, resolveProject } from "./config.js";

describe("validateProjectSlug", () => {
  const validSlugs = [
    "my-project",
    "my_project",
    "my.project",
    "a",
    "A1",
    "project-123_test.example",
    "UPPERCASE",
    "MixedCase",
  ];

  for (const slug of validSlugs) {
    it(`accepts "${slug}"`, () => {
      expect(validateProjectSlug(slug)).toBe(slug);
    });
  }

  const invalidSlugs = [
    { slug: "", reason: "empty string" },
    { slug: "-starts-with-dash", reason: "starts with dash" },
    { slug: ".starts-with-dot", reason: "starts with dot" },
    { slug: "has spaces", reason: "contains spaces" },
    { slug: "has/slash", reason: "contains slash" },
    { slug: "has\\backslash", reason: "contains backslash" },
    { slug: "has..traversal", reason: "contains traversal" },
    { slug: "has!special", reason: "contains special char" },
    { slug: "has@at", reason: "contains @" },
    { slug: "has:colon", reason: "contains colon" },
    { slug: "has()parens", reason: "contains parens" },
    { slug: "has#hash", reason: "contains hash" },
  ];

  for (const { slug, reason } of invalidSlugs) {
    it(`rejects "${slug}" (${reason})`, () => {
      expect(() => validateProjectSlug(slug)).toThrow();
    });
  }

  it("throws with descriptive message for invalid slug", () => {
    try {
      validateProjectSlug("invalid slug!");
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("Invalid project slug");
    }
  });
});

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VAULT_PATH;
    delete process.env.MAX_INJECT_TOKENS;
    delete process.env.SESSION_TTL_HOURS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads default config", () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config.vaultPath).toBeTruthy();
    expect(config.maxInjectTokens).toBe(1500);
    expect(config.sessionTtlHours).toBe(2);
  });

  it("expands tilde in VAULT_PATH", () => {
    process.env.VAULT_PATH = "~/custom-vault";
    const config = loadConfig();
    expect(config.vaultPath).not.toContain("~");
    expect(config.vaultPath).toContain("custom-vault");
  });

  it("resolves absolute VAULT_PATH under home", () => {
    process.env.VAULT_PATH = `${homedir()}/custom-vault`;
    const config = loadConfig();
    expect(config.vaultPath).toContain("custom-vault");
  });

  it("throws when VAULT_PATH is outside home directory", () => {
    process.env.VAULT_PATH = "/outside/home/vault";
    expect(() => loadConfig()).toThrow("must be under home directory");
  });

  it("parses MAX_INJECT_TOKENS", () => {
    process.env.MAX_INJECT_TOKENS = "3000";
    const config = loadConfig();
    expect(config.maxInjectTokens).toBe(3000);
  });

  it("clamps MAX_INJECT_TOKENS to max 50000", () => {
    process.env.MAX_INJECT_TOKENS = "100000";
    const config = loadConfig();
    expect(config.maxInjectTokens).toBe(50000);
  });

  it("clamps MAX_INJECT_TOKENS to min 100", () => {
    process.env.MAX_INJECT_TOKENS = "50";
    const config = loadConfig();
    expect(config.maxInjectTokens).toBe(100);
  });

  it("handles NaN for MAX_INJECT_TOKENS", () => {
    process.env.MAX_INJECT_TOKENS = "not-a-number";
    const config = loadConfig();
    expect(config.maxInjectTokens).toBe(1500);
  });

  it("parses SESSION_TTL_HOURS", () => {
    process.env.SESSION_TTL_HOURS = "8";
    const config = loadConfig();
    expect(config.sessionTtlHours).toBe(8);
  });

  it("clamps SESSION_TTL_HOURS to max 168", () => {
    process.env.SESSION_TTL_HOURS = "200";
    const config = loadConfig();
    expect(config.sessionTtlHours).toBe(168);
  });

  it("clamps SESSION_TTL_HOURS to min 1", () => {
    process.env.SESSION_TTL_HOURS = "0";
    const config = loadConfig();
    expect(config.sessionTtlHours).toBe(1);
  });

  it("handles NaN for SESSION_TTL_HOURS", () => {
    process.env.SESSION_TTL_HOURS = "invalid";
    const config = loadConfig();
    expect(config.sessionTtlHours).toBe(2);
  });
});

describe("resolveProject", () => {
  it("returns validated explicit slug", async () => {
    const vaultPath = "/tmp/test-vault";
    const slug = await resolveProject(vaultPath, "my-project");
    expect(slug).toBe("my-project");
  });

  it("throws for invalid explicit slug", async () => {
    const vaultPath = "/tmp/test-vault";
    await expect(resolveProject(vaultPath, "invalid slug!")).rejects.toThrow("Invalid project slug");
  });

  it("throws when no slug provided and detection fails", async () => {
    const vaultPath = "/tmp/nonexistent-vault";
    await expect(resolveProject(vaultPath, null)).rejects.toThrow("Could not detect project");
  });

  it("throws when no slug provided and detection returns undefined", async () => {
    const vaultPath = "/tmp/nonexistent-vault";
    await expect(resolveProject(vaultPath, undefined)).rejects.toThrow("Could not detect project");
  });

  it("passes undefined slug to detection", async () => {
    const vaultPath = "/tmp/nonexistent-vault";
    await expect(resolveProject(vaultPath)).rejects.toThrow("Could not detect project");
  });
});
