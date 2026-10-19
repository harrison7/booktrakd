import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/cover";
import { Avatar } from "@/components/header-client";
import { serverApi } from "@/server/api";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const api = await serverApi();
  const [books, authors, members] = q
    ? await Promise.all([
        api.search.books({ q, limit: 30 }),
        api.search.authors({ q }),
        api.search.members({ q }),
      ])
    : [[], [], []];

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1fr_240px]">
      <section>
        <h1 className="mb-4 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
          {q ? `Books matching “${q}”` : "Search for a book, author or member"}
        </h1>
        {q && books.length === 0 && <p className="text-sm text-muted">No books found.</p>}
        <ul className="divide-y divide-border">
          {books.map((b, i) => (
            <li key={b.id} className="flex gap-4 py-3">
              <div className="w-[70px] shrink-0">
                <BookCover book={b} size="sm" priority={i < 6} />
              </div>
              <div>
                <Link
                  href={`/book/${b.slug}`}
                  className="font-serif text-xl font-semibold hover:text-read"
                >
                  {b.title}
                </Link>{" "}
                {b.year && <span className="text-muted">{b.year}</span>}
                {b.authors && <p className="text-sm text-muted">by {b.authors}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="flex flex-col gap-8">
        {authors.length > 0 && (
          <div>
            <h2 className="mb-2 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
              Authors
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {authors.map((a) => (
                <li key={a.slug}>
                  <Link href={`/author/${a.slug}`} className="hover:text-read">
                    {a.name}
                  </Link>{" "}
                  <span className="text-xs text-muted">{a.works} books</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {members.length > 0 && (
          <div>
            <h2 className="mb-2 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
              Members
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {members.map((m) => (
                <li key={m.username}>
                  <Link
                    href={`/${m.username}` as never}
                    className="flex items-center gap-2 hover:text-read"
                  >
                    <Avatar name={m.name} size={24} /> {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
