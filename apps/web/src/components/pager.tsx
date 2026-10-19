import Link from "next/link";

/** Older / Newer links for offset-paginated pages. `base` ends with "?" or "&". */
export function Pager({
  base,
  offset,
  nextOffset,
  pageSize = 50,
}: {
  base: string;
  offset: number;
  nextOffset: number | null;
  pageSize?: number;
}) {
  if (offset === 0 && nextOffset == null) return null;
  const prev = Math.max(0, offset - pageSize);
  return (
    <nav className="mt-8 flex justify-between text-sm">
      {offset > 0 ? (
        <Link href={`${base}offset=${prev}` as never} className="text-muted hover:text-text">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      {nextOffset != null && (
        <Link href={`${base}offset=${nextOffset}` as never} className="text-muted hover:text-text">
          Older →
        </Link>
      )}
    </nav>
  );
}
