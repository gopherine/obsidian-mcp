import { VaultFS } from "../lib/vault-fs.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
  createFrontmatter,
  mergeFrontmatter,
  validateFrontmatter,
  type Frontmatter,
} from "../lib/frontmatter.js";

export async function writeCommand(
  vaultFs: VaultFS,
  path: string,
  content: string,
  options: {
    mode?: "overwrite" | "append" | "prepend";
    frontmatter?: Partial<Frontmatter>;
  } = {}
): Promise<{ written: boolean; path: string; bytes: number }> {
  const { mode = "overwrite", frontmatter: fmOverrides } = options;

  await vaultFs.verifyNoSymlinkEscape(path);

  if (mode === "append") {
    // If file doesn't exist, create it (same as overwrite) instead of throwing
    const fileExists = await vaultFs.exists(path);
    if (!fileExists) {
      const fm = fmOverrides ? createFrontmatter(fmOverrides) : createFrontmatter({});
      const errors = validateFrontmatter(fm);
      if (errors.length > 0) {
        throw new Error(`Invalid frontmatter: ${errors.join("; ")}`);
      }
      const result = await vaultFs.write(path, serializeFrontmatter(fm, content));
      return { written: true, ...result };
    }
    // Atomic read-modify-write: read existing, append content, write back
    const existing = await vaultFs.read(path);
    const { data, content: body } = parseFrontmatter(existing);
    const updatedBody = body.trimEnd() + "\n" + content;
    const updatedFm = mergeFrontmatter(data, fmOverrides ?? {});
    const result = await vaultFs.write(path, serializeFrontmatter(updatedFm, updatedBody));
    return { written: true, ...result };
  }

  if (mode === "prepend") {
    const fileExists = await vaultFs.exists(path);
    if (!fileExists) {
      // Create new file with content
      const fm = fmOverrides ? createFrontmatter(fmOverrides) : createFrontmatter({});
      const errors = validateFrontmatter(fm);
      if (errors.length > 0) {
        throw new Error(`Invalid frontmatter: ${errors.join("; ")}`);
      }
      const result = await vaultFs.write(path, serializeFrontmatter(fm, content));
      return { written: true, ...result };
    }
    const existing = await vaultFs.read(path);
    const { data, content: body } = parseFrontmatter(existing);
    const updated = mergeFrontmatter(data, fmOverrides ?? {});
    const newBody = content + "\n" + body;
    const result = await vaultFs.write(path, serializeFrontmatter(updated, newBody));
    return { written: true, ...result };
  }

  // Overwrite mode
  const fm = fmOverrides
    ? createFrontmatter(fmOverrides)
    : createFrontmatter({});

  const errors = validateFrontmatter(fm);
  if (errors.length > 0) {
    throw new Error(`Invalid frontmatter: ${errors.join("; ")}`);
  }

  const fullContent = serializeFrontmatter(fm, content);
  const result = await vaultFs.write(path, fullContent);
  return { written: true, ...result };
}
