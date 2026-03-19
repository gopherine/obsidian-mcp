import type { CommandContext } from "../core/types.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
  createFrontmatter,
  mergeFrontmatter,
  validateFrontmatter,
  type Frontmatter,
} from "../lib/frontmatter.js";

export async function writeCommand(
  args: {
    path: string;
    content: string;
    mode?: "overwrite" | "append" | "prepend";
    frontmatter?: Partial<Frontmatter>;
  },
  ctx: CommandContext,
): Promise<{ written: boolean; path: string; bytes: number }> {
  const { path, content, mode = "append", frontmatter: fmOverrides } = args;
  const vaultFs = ctx.vaultFs;

  await vaultFs.verifyNoSymlinkEscape(path);

  if (mode === "append" || mode === "prepend") {
    const fileExists = await vaultFs.exists(path);
    if (!fileExists) {
      return createNewFile(vaultFs, path, content, fmOverrides);
    }
    const existing = await vaultFs.read(path);
    const { data, content: body } = parseFrontmatter(existing);
    const updatedFm = mergeFrontmatter(data, fmOverrides ?? {});
    const newBody = mode === "append"
      ? body.trimEnd() + "\n" + content
      : content + "\n" + body;
    const result = await vaultFs.write(path, serializeFrontmatter(updatedFm, newBody));
    return { written: true, ...result };
  }

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

async function createNewFile(
  vaultFs: import("../lib/vault-fs.js").VaultFS,
  path: string,
  content: string,
  fmOverrides?: Partial<Frontmatter>
): Promise<{ written: boolean; path: string; bytes: number }> {
  const fm = fmOverrides ? createFrontmatter(fmOverrides) : createFrontmatter({});
  const errors = validateFrontmatter(fm);
  if (errors.length > 0) {
    throw new Error(`Invalid frontmatter: ${errors.join("; ")}`);
  }
  const result = await vaultFs.write(path, serializeFrontmatter(fm, content));
  return { written: true, ...result };
}
