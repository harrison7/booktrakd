import type { FeedItem } from "@booktrakd/api";
import { Heart, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BookCover } from "./cover";
import { Avatar } from "./header-client";
import { Stars } from "./rating";
import { SpoilerText } from "./spoiler-text";

/** "5m", "3h", "2d", or a date for anything older than a week. */
function timeAgo(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The "frank rated Dune" sentence for an activity. */
function describe(item: FeedItem): ReactNode {
  const book = item.book && (
    <Link href={`/book/${item.book.slug}`} className="font-semibold text-text hover:text-read">
      {item.book.title}
    </Link>
  );
  switch (item.verb) {
    case "logged":
      return item.entry.dnf ? <>didn't finish {book}</> : <>read {book}</>;
    case "reviewed":
      return (
        <>
          reviewed {book}
          {item.entry.dnf && " (didn't finish)"}
        </>
      );
    case "rated":
      return <>rated {book}</>;
    case "liked_work":
      return <>liked {book}</>;
    case "read":
      return <>marked {book} as read</>;
    case "added_to_reading_list":
      return <>added {book} to their reading list</>;
    case "started_reading":
      return <>started reading {book}</>;
    case "followed":
      return (
        <>
          followed{" "}
          <Link
            href={`/${item.target.username}` as never}
            className="font-semibold text-text hover:text-read"
          >
            {item.target.displayName}
          </Link>
        </>
      );
  }
}

function FeedRow({ item }: { item: FeedItem }) {
  const entry = "entry" in item ? item.entry : null;
  const rating = entry ? entry.rating : item.verb === "rated" ? item.rating : null;
  return (
    <li className="flex gap-3 py-4">
      <Avatar name={item.actor.displayName} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">
          <Link
            href={`/${item.actor.username}` as never}
            className="font-semibold text-text hover:text-read"
          >
            {item.actor.displayName}
          </Link>{" "}
          {describe(item)}
          {rating != null && (
            <>
              {" "}
              <Stars rating={rating} />
            </>
          )}
          {entry?.liked && (
            <Heart
              className="ml-1 inline size-3.5 align-[-2px]"
              fill="var(--color-like)"
              color="var(--color-like)"
            />
          )}
          {entry?.reread && (
            <RotateCcw className="ml-1 inline size-3.5 align-[-2px]" aria-label="Reread" />
          )}
          <span className="ml-2 text-xs">
            {entry ? (
              <Link
                href={`/${item.actor.username}/review/${entry.id}` as never}
                className="hover:text-text"
              >
                {timeAgo(item.createdAt)}
              </Link>
            ) : (
              timeAgo(item.createdAt)
            )}
          </span>
        </p>
        {entry?.text && (
          <div className="mt-2 font-serif text-base leading-relaxed">
            <SpoilerText text={entry.text} spoilers={entry.spoilers} clamp />
          </div>
        )}
      </div>
      {item.book && (
        <div className="w-[46px] shrink-0">
          <BookCover book={item.book} size="xs" />
        </div>
      )}
    </li>
  );
}

/** Friends' activity, newest first. */
export function Feed({ items, empty }: { items: FeedItem[]; empty: ReactNode }) {
  if (items.length === 0) return <div className="text-sm text-muted">{empty}</div>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
