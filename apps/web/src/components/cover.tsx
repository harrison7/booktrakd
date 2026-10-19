import type { BookCard, Cover as CoverData } from "@booktrakd/api";
import { COVER_SIZES, type CoverSize, placeholderCover } from "@booktrakd/ui-tokens";
import Link from "next/link";
import type { ReactNode } from "react";
import { coverUrl, RETINA } from "@/lib/covers";

interface CoverProps {
  cover: CoverData | null;
  title: string;
  authors?: string;
  size: CoverSize;
  /** Fill the parent's width instead of the size's fixed width (for grids). */
  fluid?: boolean;
  priority?: boolean;
  className?: string;
}

/** A book cover at a fixed 2:3 ratio, or a generated placeholder when there's no art. */
export function Cover({
  cover,
  title,
  authors,
  size,
  fluid,
  priority,
  className = "",
}: CoverProps) {
  const style = fluid ? undefined : { width: COVER_SIZES[size] };
  const frame = `relative aspect-[2/3] shrink-0 overflow-hidden rounded-[3px] ${className}`;
  const ring = (
    <span className="pointer-events-none absolute inset-0 rounded-[3px] ring-1 ring-white/10 ring-inset" />
  );

  if (!cover) {
    const colors = placeholderCover(title);
    const showText = fluid || COVER_SIZES[size] >= 70;
    return (
      <div
        className={`${frame} flex flex-col justify-between p-[8%]`}
        style={{ ...style, background: colors.background, color: colors.foreground }}
        role="img"
        aria-label={title}
      >
        {showText && (
          <>
            <span className="line-clamp-5 font-serif text-[clamp(9px,1.1vw,15px)] leading-tight">
              {title}
            </span>
            {authors && (
              <span className="line-clamp-2 text-[clamp(7px,0.8vw,11px)] opacity-80">
                {authors}
              </span>
            )}
          </>
        )}
        {ring}
      </div>
    );
  }

  const src = coverUrl(cover, size);
  return (
    <div
      className={frame}
      style={{ ...style, background: cover.color ?? "var(--color-surface-2)" }}
    >
      {/* biome-ignore lint/performance/noImgElement: covers come from our own CDN at fixed sizes */}
      <img
        src={src}
        srcSet={`${src} 1x, ${coverUrl(cover, RETINA[size])} 2x`}
        alt={title}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {ring}
    </div>
  );
}

/** A cover that links to its book page, with the title on hover. */
export function BookCover({
  book,
  size,
  fluid,
  priority,
  children,
}: {
  book: BookCard;
  size: CoverSize;
  fluid?: boolean;
  priority?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link
      href={`/book/${book.slug}`}
      title={book.year ? `${book.title} (${book.year})` : book.title}
      className="group relative block transition-transform hover:z-10 hover:scale-[1.03]"
    >
      <Cover
        cover={book.cover}
        title={book.title}
        authors={book.authors}
        size={size}
        fluid={fluid}
        priority={priority}
        className="group-hover:ring-2 group-hover:ring-read"
      />
      {children}
    </Link>
  );
}

export function CoverGrid({ children, min = 110 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}
