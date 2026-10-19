// Covers that aren't cached yet: queue them for the worker and serve Open Library's copy
// meanwhile. Cached covers are linked directly (see lib/covers.ts) and never hit this route.
import { eq } from "@booktrakd/db";
import { covers } from "@booktrakd/db/schema";
import { COVER_SIZES, type CoverSize } from "@booktrakd/ui-tokens";
import { coverUrl } from "@/lib/covers";
import { services } from "@/server/services";

const OPEN_LIBRARY_SIZE: Record<CoverSize, "M" | "L"> = {
  xs: "M",
  sm: "M",
  md: "M",
  lg: "L",
  xl: "L",
};

export async function GET(_req: Request, ctx: RouteContext<"/api/covers/[id]/[size]">) {
  const { id, size } = await ctx.params;
  const coverId = Number(id);
  if (!Number.isInteger(coverId) || !(size in COVER_SIZES)) {
    return new Response("Not found", { status: 404 });
  }
  const [cover] = await services.db.select().from(covers).where(eq(covers.id, coverId));
  if (!cover) return new Response("Not found", { status: 404 });

  if (cover.status === "ready" && cover.storageKey) {
    return Response.redirect(
      new URL(
        coverUrl({ id: coverId, key: cover.storageKey, color: null }, size as CoverSize),
        _req.url,
      ),
      308,
    );
  }
  if (cover.status === "pending") await services.enqueueCover(coverId);
  if (cover.source !== "openlibrary" || cover.status === "missing") {
    return new Response("Not found", { status: 404 });
  }
  const url = `https://covers.openlibrary.org/b/id/${cover.sourceId}-${OPEN_LIBRARY_SIZE[size as CoverSize]}.jpg`;
  // Short cache: once the worker has cached it, the direct URL takes over.
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "public, max-age=3600" },
  });
}
