import type { Cover } from "@booktrakd/api";
import { type CoverSize, coverPath } from "@booktrakd/ui-tokens";

const IMAGE_BASE = (process.env.NEXT_PUBLIC_IMAGE_BASE_URL || "/images").replace(/\/$/, "");

/** Direct CDN URL when cached; otherwise the lazy route that queues caching. */
export function coverUrl(cover: Cover, size: CoverSize): string {
  return cover.key
    ? `${IMAGE_BASE}/${coverPath(cover.key, size)}`
    : `/api/covers/${cover.id}/${size}`;
}

/** The next size up, for 2× (retina) screens. */
export const RETINA: Record<CoverSize, CoverSize> = {
  xs: "sm",
  sm: "md",
  md: "lg",
  lg: "xl",
  xl: "xl",
};
