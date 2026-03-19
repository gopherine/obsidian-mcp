import type { CommandContext } from "../core/types.js";

export async function readCommand(
  args: { path: string },
  ctx: CommandContext,
): Promise<string> {
  return await ctx.vaultFs.read(args.path);
}

export async function listCommand(
  args: { path: string; depth: number },
  ctx: CommandContext,
): Promise<string[]> {
  return await ctx.vaultFs.list(args.path, args.depth);
}
