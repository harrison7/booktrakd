import { Heart } from "lucide-react";
import Link from "next/link";
import { BookCover, CoverGrid } from "@/components/cover";
import { Pager } from "@/components/pager";
import { Stars } from "@/components/rating";
import { orNotFound, serverApi } from "@/server/api";

const SORTS = [
  ["recent", "Recently read"],
  ["rating", "Rating"],
  ["title", "Title"],
] as const;

export default async function BooksPage(props: PageProps<"/[username]/books">) {
  const { username } = await props.params;
  const search = await props.searchParams;
  const sort = SORTS.find(([s]) => s === search.sort)?.[0] ?? "recent";
  const offset = Number(search.offset) || 0;
  const { books, nextOffset } = await orNotFound(
    (await serverApi()).users.books({ username, sort, offset }),
  );

  return (
    <div>
      <nav className="mb-4 flex justify-end gap-3 text-xs uppercase tracking-wider text-muted">
        {SORTS.map(([s, label]) => (
          <Link
            key={s}
            href={`/${username}/books?sort=${s}` as never}
            className={sort === s ? "text-text" : "hover:text-text"}
          >
            {label}
          </Link>
        ))}
      </nav>
      {books.length === 0 && <p className="text-sm text-muted">No books yet.</p>}
      <CoverGrid min={100}>
        {books.map((b) => (
          <div key={b.id}>
            <BookCover book={b} size="md" fluid />
            <div className="mt-1 flex h-4 items-center gap-1 text-xs">
              <Stars rating={b.rating} />
              {b.liked && (
                <Heart className="size-3" fill="var(--color-like)" color="var(--color-like)" />
              )}
            </div>
          </div>
        ))}
      </CoverGrid>
      <Pager
        base={`/${username}/books?sort=${sort}&`}
        offset={offset}
        nextOffset={nextOffset}
        pageSize={72}
      />
    </div>
  );
}
