import type { BookCard, Review } from "@booktrakd/api";
import { Heart, RotateCcw } from "lucide-react";
import Link from "next/link";
import { BookCover } from "./cover";
import { Avatar } from "./header-client";
import { Stars } from "./rating";
import { SpoilerText } from "./spoiler-text";

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** A review in a list. Pass `book` to show the book's cover alongside (profile/review lists). */
export function ReviewCard({ review, book }: { review: Review; book?: BookCard }) {
  const href = `/${review.user.username}/review/${review.id}`;
  return (
    <div className="flex gap-4 py-4">
      {book ? (
        <div className="w-[70px] shrink-0">
          <BookCover book={book} size="sm" />
        </div>
      ) : (
        <Avatar name={review.user.displayName} size={32} />
      )}
      <div className="min-w-0 flex-1">
        {book && (
          <h3 className="font-serif text-lg font-semibold">
            <Link href={`/book/${book.slug}`} className="hover:text-read">
              {book.title}
            </Link>{" "}
            {book.year && <span className="text-sm font-normal text-muted">{book.year}</span>}
          </h3>
        )}
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>
            Review by{" "}
            <Link
              href={`/${review.user.username}`}
              className="font-semibold text-text hover:text-read"
            >
              {review.user.displayName}
            </Link>
          </span>
          <Stars rating={review.rating} />
          {review.liked && (
            <Heart className="size-3.5" fill="var(--color-like)" color="var(--color-like)" />
          )}
          {review.reread && <RotateCcw className="size-3.5" aria-label="Reread" />}
          {review.dnf && <span className="text-xs uppercase text-like">DNF</span>}
          {review.finishedOn && (
            <Link href={href as never} className="text-xs hover:text-text">
              {review.dnf ? "Stopped" : "Read"} {formatDate(review.finishedOn)}
            </Link>
          )}
        </div>
        {review.text && (
          <div className="mt-2 font-serif text-base leading-relaxed">
            <SpoilerText text={review.text} spoilers={review.spoilers} clamp />
          </div>
        )}
      </div>
    </div>
  );
}
