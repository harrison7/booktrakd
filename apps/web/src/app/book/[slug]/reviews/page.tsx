import Link from "next/link";
import { Pager } from "@/components/pager";
import { ReviewCard } from "@/components/review-card";
import { orNotFound, serverApi } from "@/server/api";

export default async function BookReviewsPage(props: PageProps<"/book/[slug]/reviews">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const sort = search.sort === "recent" ? "recent" : "popular";
  const offset = Number(search.offset) || 0;
  const api = await serverApi();
  const book = await orNotFound(api.catalog.work({ slug }));
  const { reviews, nextOffset } = await api.entries.reviews({ workId: book.id, sort, offset });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-muted">
        <Link href={`/book/${slug}`} className="hover:text-text">
          {book.title}
        </Link>
      </p>
      <div className="mb-4 flex items-baseline justify-between border-b border-border pb-2">
        <h1 className="font-serif text-3xl">Reviews</h1>
        <nav className="flex gap-3 text-xs uppercase tracking-wider text-muted">
          {(["popular", "recent"] as const).map((s) => (
            <Link
              key={s}
              href={`/book/${slug}/reviews?sort=${s}`}
              className={sort === s ? "text-text" : "hover:text-text"}
            >
              {s}
            </Link>
          ))}
        </nav>
      </div>
      {reviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
      <div className="divide-y divide-border">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
      <Pager base={`/book/${slug}/reviews?sort=${sort}&`} offset={offset} nextOffset={nextOffset} />
    </div>
  );
}
