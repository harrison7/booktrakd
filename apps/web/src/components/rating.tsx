/** "★★★½" for a 1–10 rating. */
export function starsText(rating: number): string {
  return "★".repeat(Math.floor(rating / 2)) + (rating % 2 ? "½" : "");
}

export function Stars({ rating, className = "" }: { rating: number | null; className?: string }) {
  if (rating == null) return null;
  return (
    <span
      className={`text-star tracking-tight ${className}`}
      role="img"
      title={`${rating / 2} stars`}
      aria-label={`${rating / 2} stars`}
    >
      {starsText(rating)}
    </span>
  );
}

/** Letterboxd-style ratings bar chart: ½★ … 5★ with the average on the right. */
export function RatingHistogram({
  histogram,
  average,
  count,
}: {
  histogram: number[];
  average: number | null;
  count: number;
}) {
  const max = Math.max(1, ...histogram);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        <span>Ratings</span>
        <span>{count.toLocaleString()}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-xs text-star">★</span>
        <div className="flex h-12 flex-1 items-end gap-px">
          {histogram.map((n, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 buckets
              key={i}
              className="flex-1 rounded-t-sm bg-muted/40 hover:bg-muted"
              style={{ height: `${Math.max(2, (n / max) * 100)}%` }}
              title={`${n.toLocaleString()} × ${starsText(i + 1)}`}
            />
          ))}
        </div>
        <div className="flex flex-col items-center">
          <span className="font-serif text-2xl text-muted">
            {average == null ? "–" : (average / 2).toFixed(1)}
          </span>
          <span className="text-xs text-star">★★★★★</span>
        </div>
      </div>
    </div>
  );
}
