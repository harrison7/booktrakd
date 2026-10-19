// Development only: serves covers the worker cached to .data/images when R2 isn't set up.
// In production NEXT_PUBLIC_IMAGE_BASE_URL points at the CDN instead.
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "../..", process.env.DATA_DIR || ".data", "images");

export async function GET(_req: Request, ctx: RouteContext<"/images/[...path]">) {
  const { path: parts } = await ctx.params;
  const file = path.resolve(ROOT, ...parts);
  if (!file.startsWith(ROOT + path.sep) || !file.endsWith(".webp")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return new Response(await readFile(file), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
