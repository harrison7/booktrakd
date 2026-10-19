import { Heart, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/cover";
import { Stars } from "@/components/rating";
import { SpoilerText } from "@/components/spoiler-text";
import { orNotFound, serverApi } from "@/server/api";
import { DeleteEntry } from "./delete-entry";

export default async function ReviewPage(props: PageProps<"/[username]/review/[id]">) {
  const { username, id } = await props.params;
  const api = await serverApi();
  const entry = await orNotFound(api.entries.get({ id: Number(id) || 0 }));
  if (entry.user.username !== username.toLowerCase()) notFound();
  const me = await api.users.me();

  const date = entry.finishedOn
    ? new Date(`${entry.finishedOn}T00:00:00`).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex gap-8">
      <div className="w-[150px] shrink-0">
        <BookCover book={entry.book} size="md" fluid priority />
      </div>
      <article className="min-w-0 max-w-2xl flex-1">
        <h1 className="font-serif text-3xl font-semibold">
          <Link href={`/book/${entry.book.slug}`} className="hover:text-read">
            {entry.book.title}
          </Link>{" "}
          {entry.book.year && (
            <span className="text-xl font-normal text-muted">{entry.book.year}</span>
          )}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Stars rating={entry.rating} className="text-lg" />
          {entry.liked && (
            <Heart className="size-4" fill="var(--color-like)" color="var(--color-like)" />
          )}
          {entry.reread && (
            <span className="flex items-center gap-1">
              <RotateCcw className="size-3.5" /> Reread
            </span>
          )}
          {entry.dnf && <span className="uppercase text-like">Didn't finish</span>}
          {date && (
            <span>
              {entry.dnf ? "Stopped" : "Read"} {date}
            </span>
          )}
          {entry.format && <span className="capitalize">{entry.format}</span>}
        </div>
        {entry.text && (
          <div className="mt-6 font-serif text-lg leading-relaxed">
            <SpoilerText text={entry.text} spoilers={entry.spoilers} />
          </div>
        )}
        {entry.tags.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2">
            {entry.tags.map((t) => (
              <li key={t} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
                {t}
              </li>
            ))}
          </ul>
        )}
        {me?.username === entry.user.username && <DeleteEntry id={entry.id} username={username} />}
      </article>
    </div>
  );
}
