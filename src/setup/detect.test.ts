import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";
import { detectClient, detectClients } from "./detect.js";
import { CLIENT_REGISTRY } from "./clients.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

const mockExists = vi.mocked(existsSync);

beforeEach(() => {
  mockExists.mockReset();
});

describe("detectClient", () => {
  it("returns DetectedClient when config path exists", () => {
    mockExists.mockReturnValue(true);
    const claude = CLIENT_REGISTRY.find((c) => c.slug === "claude-code")!;
    const result = detectClient(claude);
    expect(result).not.toBeNull();
    expect(result!.config.slug).toBe("claude-code");
    expect(result!.mcpConfigPath).toContain(".claude.json");
  });

  it("returns null when config path does not exist", () => {
    mockExists.mockReturnValue(false);
    const claude = CLIENT_REGISTRY.find((c) => c.slug === "claude-code")!;
    expect(detectClient(claude)).toBeNull();
  });
});

describe("detectClients", () => {
  it("returns only clients whose config exists", () => {
    mockExists.mockImplementation((p) =>
      String(p).includes(".claude.json")
    );
    const detected = detectClients();
    expect(detected.length).toBe(1);
    expect(detected[0].config.slug).toBe("claude-code");
  });

  it("returns empty array when no clients detected", () => {
    mockExists.mockReturnValue(false);
    expect(detectClients()).toEqual([]);
  });

  it("returns all clients when all config paths exist", () => {
    mockExists.mockReturnValue(true);
    const detected = detectClients();
    expect(detected.length).toBe(CLIENT_REGISTRY.length);
  });
});
