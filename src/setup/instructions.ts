import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import {
  INSTRUCTION_TEXT,
  MARKER_START_HTML,
  MARKER_END_HTML,
} from "./types.js";

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const MARKED_BLOCK = `${MARKER_START_HTML}\n${INSTRUCTION_TEXT}\n${MARKER_END_HTML}`;

export function writeMarkdownInstruction(
  filePath: string,
  force = false
): "created" | "appended" | "exists" {
  ensureDir(filePath);

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    if (content.includes(MARKER_START_HTML)) {
      if (!force) return "exists";
      const cleaned = removeMarkedBlock(content);
      writeFileSync(filePath, cleaned.trimEnd() + "\n\n" + MARKED_BLOCK + "\n", "utf-8");
      return "appended";
    }
    writeFileSync(filePath, content.trimEnd() + "\n\n" + MARKED_BLOCK + "\n", "utf-8");
    return "appended";
  }

  writeFileSync(filePath, MARKED_BLOCK + "\n", "utf-8");
  return "created";
}

export function removeMarkdownInstruction(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf-8");
  if (!content.includes(MARKER_START_HTML)) return false;

  const cleaned = removeMarkedBlock(content);
  writeFileSync(filePath, cleaned, "utf-8");
  return true;
}

function removeMarkedBlock(content: string): string {
  const regex = new RegExp(
    `\\n?${escapeRegex(MARKER_START_HTML)}[\\s\\S]*?${escapeRegex(MARKER_END_HTML)}\\n?`,
    "g"
  );
  return content.replace(regex, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const MDC_CONTENT = `---
description: Obsidian knowledge base integration
alwaysApply: true
---

${INSTRUCTION_TEXT}
`;

export function writeMdcInstruction(filePath: string): void {
  ensureDir(filePath);
  writeFileSync(filePath, MDC_CONTENT, "utf-8");
}

export function removeMdcInstruction(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
