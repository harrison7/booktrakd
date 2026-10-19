import { AlignLeft, Heart, RotateCcw } from "lucide-react";
import Link from "next/link";
import { BookCover } from "@/components/cover";
import { Pager } from "@/components/pager";
import { Stars } from "@/components/rating";
import { orNotFound, serverApi } from "@/server/api";

export default async function DiaryPage(props: PageProps<"/[username]/diary">) {
  const { username } = await props.params;
  const offset = Number((await props.searchParams).offset) || 0;
  const { entries, nextOffset } = await orNotFound(
    (await serverApi()).entries.diary({ username, offset }),
  );

  let lastMonth = "";
  return (
    <div>
      {entries.length === 0 && <p className="text-sm text-muted">The diary is empty.</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-[10px] uppercase tracking-wider text-muted">
          <tr className="border-b border-border">
            <th className="w-20 py-2 font-normal">Month</th>
            <th className="w-12 font-normal">Day</th>
            <th className="font-normal">Book</th>
            <th className="w-28 font-normal">Rating</th>
            <th className="w-20 font-normal" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const date = new Date(
              `${e.finishedOn ?? e.createdAt.toISOString().slice(0, 10)}T00:00:00`,
            );
            const month = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
            const showMonth = month !== lastMonth;
            lastMonth = month;
            return (
              <tr key={e.id} className="border-b border-border/60">
                <td className="py-2 align-top">
                  {showMonth && (
                    <span className="inline-block rounded bg-surface-2 px-2 py-1 text-center text-[10px] font-bold uppercase leading-tight whitespace-pre-line">
                      {month.split(" ").join("\n")}
                    </span>
                  )}
                </td>
                <td className="font-serif text-2xl text-muted">{date.getDate()}</td>
                <td>
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-[46px] shrink-0">
                      <BookCover book={e.book} size="xs" />
                    </div>
                    <div>
                      <Link href={`/book/${e.book.slug}`} className="font-semibold hover:text-read">
                        {e.book.title}
                      </Link>{" "}
                      {e.book.year && <span className="text-muted">{e.book.year}</span>}
                      {e.dnf && <span className="ml-2 text-[10px] uppercase text-like">DNF</span>}
                    </div>
                  </div>
                </td>
                <td>
                  <Stars rating={e.rating} />
                </td>
                <td>
                  <span className="flex items-center gap-2 text-muted">
                    {e.liked && (
                      <Heart
                        className="size-3.5"
                        fill="var(--color-like)"
                        color="var(--color-like)"
                      />
                    )}
                    {e.reread && <RotateCcw className="size-3.5" aria-label="Reread" />}
                    {e.text && (
                      <Link href={`/${username}/review/${e.id}` as never} aria-label="Review">
                        <AlignLeft className="size-3.5 hover:text-text" />
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager base={`/${username}/diary?`} offset={offset} nextOffset={nextOffset} />
    </div>
  );
}
