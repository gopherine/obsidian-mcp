import { readFile, writeFile, appendFile, mkdir, readdir, stat, realpath, unlink, rename } from "fs/promises";
import { join, resolve, relative, dirname } from "path";

/**
 * Safe filesystem operations on the vault.
 * Every path is resolved against the vault root and validated.
 */
export class VaultFS {
  constructor(private readonly root: string) {}

  /**
   * Resolve a relative vault path to an absolute path.
   * Rejects traversal attacks, absolute paths, and personal vault access.
   */
  private resolve(relativePath: string): string {
    // Reject non-ASCII characters (prevents Unicode homoglyph attacks on APFS)
    if (/[^\x20-\x7E]/.test(relativePath)) {
      throw new VaultError("PERMISSION_DENIED", `Non-ASCII characters not allowed in paths: ${relativePath}`);
    }

    // Reject absolute paths
    if (relativePath.startsWith("/") || relativePath.startsWith("~")) {
      throw new VaultError("PERMISSION_DENIED", `Absolute paths not allowed: ${relativePath}`);
    }

    // Reject traversal
    if (relativePath.includes("..")) {
      throw new VaultError("PERMISSION_DENIED", `Path traversal not allowed: ${relativePath}`);
    }

    // Reject personal vault references (case-insensitive, segment-level match)
    const segments = relativePath.toLowerCase().split("/");
    if (segments.some((seg) => seg === "personal")) {
      throw new VaultError("PERMISSION_DENIED", `Cannot access personal vault: ${relativePath}`);
    }

    const resolved = resolve(this.root, relativePath);

    // Double-check the resolved path is within vault
    const rel = relative(this.root, resolved);
    if (rel.startsWith("..")) {
      throw new VaultError("PERMISSION_DENIED", `Path escapes vault: ${relativePath}`);
    }

    return resolved;
  }

  async read(relativePath: string): Promise<string> {
    const abs = this.resolve(relativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    try {
      return await readFile(abs, "utf-8");
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new VaultError("FILE_NOT_FOUND", `Not found: ${relativePath}`);
      }
      throw e;
    }
  }

  async write(relativePath: string, content: string): Promise<{ path: string; bytes: number }> {
    const abs = this.resolve(relativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
    return { path: relativePath, bytes: Buffer.byteLength(content, "utf-8") };
  }

  async append(relativePath: string, content: string): Promise<{ path: string; bytes: number }> {
    const abs = this.resolve(relativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    if (!(await this.exists(relativePath))) {
      throw new VaultError("FILE_NOT_FOUND", `Cannot append to non-existent file: ${relativePath}`);
    }
    await appendFile(abs, content, "utf-8");
    return { path: relativePath, bytes: Buffer.byteLength(content, "utf-8") };
  }

  async list(relativePath: string, depth: number = 1): Promise<string[]> {
    const abs = this.resolve(relativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    const results: string[] = [];
    await this.listRecursive(abs, relativePath, depth, 0, results);
    return results;
  }

  private async listRecursive(
    absDir: string,
    relDir: string,
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new VaultError("FILE_NOT_FOUND", `Directory not found: ${relDir}`);
      }
      throw e;
    }

    for (const entry of entries) {
      // Skip hidden files/dirs (.obsidian, .git, etc.)
      if (entry.name.startsWith(".")) continue;

      // Skip symlinks to prevent following links outside the vault
      if (entry.isSymbolicLink()) continue;

      const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push(`${entryRel}/`);
        await this.listRecursive(join(absDir, entry.name), entryRel, maxDepth, currentDepth + 1, results);
      } else {
        results.push(entryRel);
      }
    }
  }

  async delete(relativePath: string): Promise<void> {
    const abs = this.resolve(relativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    try {
      await unlink(abs);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new VaultError("FILE_NOT_FOUND", `Not found: ${relativePath}`);
      }
      throw e;
    }
  }

  async move(relativePath: string, newRelativePath: string): Promise<{ from: string; to: string }> {
    const absFrom = this.resolve(relativePath);
    const absTo = this.resolve(newRelativePath);
    await this.verifyNoSymlinkEscape(relativePath);
    await this.verifyNoSymlinkEscape(newRelativePath);
    await mkdir(dirname(absTo), { recursive: true });
    try {
      await rename(absFrom, absTo);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new VaultError("FILE_NOT_FOUND", `Not found: ${relativePath}`);
      }
      throw e;
    }
    return { from: relativePath, to: newRelativePath };
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const abs = this.resolve(relativePath);
      await stat(abs);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a path doesn't follow symlinks outside the vault.
   */
  async verifyNoSymlinkEscape(relativePath: string): Promise<void> {
    const abs = this.resolve(relativePath);

    if (!(await this.exists(relativePath))) {
      return;
    }

    try {
      const [realAbs, realRoot] = await Promise.all([realpath(abs), realpath(this.root)]);
      const rel = relative(realRoot, realAbs);
      if (rel.startsWith("..")) {
        throw new VaultError("PERMISSION_DENIED", `Symlink escapes vault: ${relativePath}`);
      }
    } catch (e: any) {
      if (e instanceof VaultError) throw e;
      if (e.code === "ENOENT") return;
      throw e;
    }
  }
}

export class VaultError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "VaultError";
  }
}
