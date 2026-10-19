import type { Metadata } from "next";
import { CoverGrid, GridBook } from "@/components/cover";
import { ShelvesProvider } from "@/components/quick-actions";
import { ReportIssue } from "@/components/report-issue";
import { SpoilerText } from "@/components/spoiler-text";
import { orNotFound, serverApi } from "@/server/api";

const getAuthor = async (slug: string) => orNotFound((await serverApi()).catalog.author({ slug }));

export async function generateMetadata(props: PageProps<"/author/[slug]">): Promise<Metadata> {
  const author = await getAuthor((await props.params).slug);
  return { title: author.name };
}

export default async function AuthorPage(props: PageProps<"/author/[slug]">) {
  const { slug } = await props.params;
  const author = await getAuthor(slug);
  const me = await (await serverApi()).users.me();
  const read = author.books.filter((b) => author.shelves[b.id]?.read).length;
  const lifespan = [author.birthDate, author.deathDate].filter(Boolean).join(" – ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex gap-6">
        {author.olPhotoId && (
          // biome-ignore lint/performance/noImgElement: Open Library author photo
          <img
            src={`https://covers.openlibrary.org/a/id/${author.olPhotoId}-M.jpg`}
            alt=""
            className="size-28 shrink-0 rounded-full bg-surface-2 object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">Books by</p>
          <h1 className="font-serif text-4xl font-semibold">{author.name}</h1>
          {lifespan && <p className="text-sm text-muted">{lifespan}</p>}
          {author.bio && (
            <div className="mt-3 max-w-3xl font-serif text-base leading-relaxed text-text/90">
              <SpoilerText text={author.bio} spoilers={false} clamp />
            </div>
          )}
        </div>
      </header>

      <div className="mb-3 flex items-baseline justify-between border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        <span>{author.books.length.toLocaleString()} books</span>
        {me && author.books.length > 0 && (
          <span>
            You've read {read} of {author.books.length}
          </span>
        )}
      </div>
      {me ? (
        <ShelvesProvider workIds={author.books.map((b) => b.id)}>
          <CoverGrid>
            {author.books.map((b) => (
              <GridBook key={b.id} book={b} actions />
            ))}
          </CoverGrid>
        </ShelvesProvider>
      ) : (
        <CoverGrid>
          {author.books.map((b) => (
            <GridBook key={b.id} book={b} />
          ))}
        </CoverGrid>
      )}
      <ReportIssue objectType="author" objectId={author.id} signedIn={me !== null} />
    </div>
  );
}
