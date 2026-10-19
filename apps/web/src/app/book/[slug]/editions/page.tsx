import Link from "next/link";
import { Cover } from "@/components/cover";
import { orNotFound, serverApi } from "@/server/api";

export default async function EditionsPage(props: PageProps<"/book/[slug]/editions">) {
  const { slug } = await props.params;
  const api = await serverApi();
  const book = await orNotFound(api.catalog.work({ slug }));
  const editions = await api.catalog.editions({ workId: book.id });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted">
        <Link href={`/book/${slug}`} className="hover:text-text">
          {book.title}
        </Link>
      </p>
      <h1 className="mb-6 font-serif text-3xl">{book.editionCount.toLocaleString()} editions</h1>
      <ul className="divide-y divide-border">
        {editions.map((e) => (
          <li key={e.id} className="flex gap-4 py-3">
            {e.olCoverId ? (
              // Edition covers aren't cached by the worker (low traffic), so link Open Library's.
              // biome-ignore lint/performance/noImgElement: external thumbnail
              <img
                src={`https://covers.openlibrary.org/b/id/${e.olCoverId}-M.jpg`}
                alt=""
                loading="lazy"
                className="aspect-[2/3] w-[46px] shrink-0 rounded-[3px] bg-surface-2 object-cover"
              />
            ) : (
              <Cover cover={null} title={e.title} size="xs" />
            )}
            <div className="text-sm">
              <p className="font-semibold">{e.title}</p>
              <p className="text-muted">
                {[
                  e.publisher,
                  e.publishDate,
                  e.format,
                  e.pageCount && `${e.pageCount} pages`,
                  e.language,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {e.isbn13 && <p className="text-xs text-muted">ISBN {e.isbn13}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
