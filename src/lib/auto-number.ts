import { VaultFS } from "./vault-fs.js";

/**
 * Find the next auto-increment number for files in a directory.
 * Scans existing files matching NNN-*.md pattern.
 */
export async function getNextNumber(vaultFs: VaultFS, dirPath: string): Promise<number> {
  let nextNumber = 1;
  try {
    const files = await vaultFs.list(dirPath, 1);
    for (const file of files) {
      const match = file.match(/(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= nextNumber) nextNumber = num + 1;
      }
    }
  } catch {
    // Directory doesn't exist yet, start at 1
  }
  return nextNumber;
}

/**
 * Generate a filename slug from a title.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
