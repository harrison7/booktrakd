import type { Metadata } from "next";
import Link from "next/link";
import { ActionPanel } from "@/components/action-panel";
import { Cover } from "@/components/cover";
import { RatingHistogram } from "@/components/rating";
import { ReportIssue } from "@/components/report-issue";
import { ReviewCard } from "@/components/review-card";
import { SpoilerText } from "@/components/spoiler-text";
import { coverUrl } from "@/lib/covers";
import { orNotFound, serverApi } from "@/server/api";

const getBook = async (slug: string) => orNotFound((await serverApi()).catalog.work({ slug }));

export async function generateMetadata(props: PageProps<"/book/[slug]">): Promise<Metadata> {
  const book = await getBook((await props.params).slug);
  const by = book.contributors.filter((c) => c.role === "author").map((c) => c.name);
  return {
    title: book.year ? `${book.title} (${book.year})` : book.title,
    description: book.description?.slice(0, 200) ?? `${book.title} by ${by.join(", ")}`,
  };
}

const LANGUAGES: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fre: "French",
  ger: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  jpn: "Japanese",
  chi: "Chinese",
};

export default async function BookPage(props: PageProps<"/book/[slug]">) {
  const book = await getBook((await props.params).slug);
  const authors = book.contributors.filter((c) => c.role === "author");
  const others = book.contributors.filter((c) => c.role !== "author");

  return (
    <article className="relative">
      {/* Books have no backdrops, so a blurred, darkened cover stands in for one. */}
      {book.cover && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full w-full scale-125 bg-cover bg-center opacity-30 blur-3xl"
            style={{ backgroundImage: `url(${coverUrl(book.cover, "md")})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/60 to-bg" />
        </div>
      )}

      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pt-10 md:grid-cols-[230px_1fr] lg:grid-cols-[230px_1fr_260px]">
        <aside className="order-1 flex flex-col items-center gap-4 md:order-none md:items-stretch">
          <Cover
            cover={book.cover}
            title={book.title}
            authors={authors.map((a) => a.name).join(", ")}
            size="lg"
            priority
          />
          <dl className="flex justify-center gap-5 text-xs text-muted">
            <Stat label="read" value={book.stats.readCount} color="text-read" />
            <Stat label="likes" value={book.stats.likeCount} color="text-like" />
            <Stat label="want to read" value={book.stats.readingListCount} color="text-list" />
          </dl>
        </aside>

        <div className="order-3 min-w-0 md:order-none">
          <h1 className="font-serif text-4xl leading-tight font-semibold">{book.title}</h1>
          {book.subtitle && <p className="mt-1 font-serif text-xl text-muted">{book.subtitle}</p>}
          <p className="mt-2 text-lg text-muted">
            {book.year && <span className="mr-2 text-text">{book.year}</span>}
            {authors.length > 0 && (
              <>
                by{" "}
                {authors.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && ", "}
                    <Link href={`/author/${a.slug}`} className="text-text hover:text-read">
                      {a.name}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
          {book.series && (
            <p className="mt-1 text-sm text-muted">
              {book.series.name}
              {book.series.position != null && ` #${book.series.position}`}
            </p>
          )}

          {book.description && (
            <div className="mt-6 font-serif text-lg leading-relaxed text-text/90">
              <SpoilerText text={book.description} spoilers={false} clamp />
            </div>
          )}

          {book.genres.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {book.genres.map((g) => (
                <li key={g.slug} className="rounded bg-surface-2 px-2.5 py-1 text-xs text-muted">
                  {g.name}
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {book.pageCount && (
              <>
                <dt className="text-muted">Pages</dt>
                <dd>{book.pageCount}</dd>
              </>
            )}
            <dt className="text-muted">Editions</dt>
            <dd>
              <Link href={`/book/${book.slug}/editions`} className="hover:text-read">
                {book.editionCount.toLocaleString()}
              </Link>
            </dd>
            {book.language && (
              <>
                <dt className="text-muted">Language</dt>
                <dd>{LANGUAGES[book.language] ?? book.language}</dd>
              </>
            )}
            {others.length > 0 && (
              <>
                <dt className="text-muted">Contributors</dt>
                <dd>{others.map((c) => `${c.name} (${c.role})`).join(", ")}</dd>
              </>
            )}
          </dl>

          <section className="mt-10">
            <h2 className="mb-3 flex items-baseline justify-between border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
              <span>Popular reviews</span>
              {book.stats.reviewCount > 0 && (
                <Link href={`/book/${book.slug}/reviews`} className="hover:text-text">
                  All {book.stats.reviewCount.toLocaleString()}
                </Link>
              )}
            </h2>
            {book.reviews.length === 0 ? (
              <p className="text-sm text-muted">No reviews yet. Be the first.</p>
            ) : (
              <div className="divide-y divide-border">
                {book.reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            )}
          </section>

          <ReportIssue objectType="work" objectId={book.id} signedIn={book.shelf !== null} />
        </div>

        <aside className="order-2 flex flex-col gap-6 md:order-none md:col-span-2 lg:col-span-1">
          <ActionPanel
            book={{ id: book.id, slug: book.slug, title: book.title }}
            shelf={book.shelf}
          />
          <RatingHistogram
            histogram={book.stats.histogram}
            average={book.stats.ratingAvg}
            count={book.stats.ratingCount}
          />
        </aside>
      </div>
    </article>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <dd className={`text-sm font-semibold ${color}`}>{value.toLocaleString()}</dd>
      <dt>{label}</dt>
    </div>
  );
}
