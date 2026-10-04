import type { Database } from "@booktrakd/db";
import { eq } from "@booktrakd/db";
import { covers } from "@booktrakd/db/schema";
import { COVER_ASPECT, COVER_SIZES, type CoverSize, coverPath } from "@booktrakd/ui-tokens";
import sharp from "sharp";
import type { ImageStorage } from "./storage";

export interface ProcessCoverOptions {
  fetch?: typeof globalThis.fetch;
  userAgent: string;
}

export interface ProcessCoverResult {
  status: "ready" | "missing" | "skipped";
  workId: number | null;
  storageKey?: string;
  dominantColor?: string;
}

// Open Library serves a 1×1 placeholder for some missing covers instead of a 404.
const MIN_SOURCE_WIDTH = 20;

const toHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

export const openLibraryCoverUrl = (coverId: string) =>
  `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg?default=false`;

/**
 * Fetches a cover from its source, stores every size as WebP, and records its dimensions
 * and dominant color. Throws on transient failures so the job queue retries it.
 */
export async function processCover(
  db: Database,
  storage: ImageStorage,
  coverId: number,
  { fetch = globalThis.fetch, userAgent }: ProcessCoverOptions,
): Promise<ProcessCoverResult> {
  const [cover] = await db.select().from(covers).where(eq(covers.id, coverId));
  if (!cover) return { status: "skipped", workId: null };
  if (cover.status === "ready" || cover.status === "missing") {
    return { status: "skipped", workId: cover.workId };
  }
  if (cover.source !== "openlibrary") {
    throw new Error(`Cover source "${cover.source}" is not supported yet`);
  }

  const res = await fetch(openLibraryCoverUrl(cover.sourceId), {
    headers: { "User-Agent": userAgent },
  });
  if (res.status === 404) {
    await db.update(covers).set({ status: "missing" }).where(eq(covers.id, coverId));
    return { status: "missing", workId: cover.workId };
  }
  if (!res.ok) throw new Error(`Cover ${coverId}: HTTP ${res.status}`);

  const source = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height || meta.width < MIN_SOURCE_WIDTH) {
    await db.update(covers).set({ status: "missing" }).where(eq(covers.id, coverId));
    return { status: "missing", workId: cover.workId };
  }

  const storageKey = `covers/${coverId}`;
  for (const [size, width] of Object.entries(COVER_SIZES) as [CoverSize, number][]) {
    const image = await sharp(source)
      .resize({
        width,
        height: Math.round(width * COVER_ASPECT),
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    await storage.put(coverPath(storageKey, size), image, "image/webp");
  }

  const { dominant } = await sharp(source).stats();
  const dominantColor = toHex(dominant);
  await db
    .update(covers)
    .set({
      status: "ready",
      storageKey,
      width: meta.width,
      height: meta.height,
      dominantColor,
    })
    .where(eq(covers.id, coverId));

  return { status: "ready", workId: cover.workId, storageKey, dominantColor };
}
