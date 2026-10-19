"use client";

import { applyShelfPatch, type ShelfState } from "@booktrakd/api/shelf-rules";
import { useMutation } from "@tanstack/react-query";
import { BookCheck, Bookmark, BookOpen, Heart, Share2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { LogDialog } from "./log-dialog";
import { StarInput } from "./star-input";

interface Book {
  id: number;
  slug: string;
  title: string;
}

/** The book page's sidebar: read / like / reading list toggles, rating, log & review. */
export function ActionPanel({ book, shelf }: { book: Book; shelf: ShelfState | null }) {
  if (!shelf) {
    return (
      <div className="rounded-md bg-surface-2 p-4 text-center text-sm text-muted">
        <Link href={`/sign-in?next=/book/${book.slug}`} className="text-text underline">
          Sign in
        </Link>{" "}
        to log, rate or review
      </div>
    );
  }
  return <SignedInPanel book={book} initial={shelf} />;
}

function SignedInPanel({ book, initial }: { book: Book; initial: ShelfState }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const update = useMutation(
    trpc.shelf.update.mutationOptions({
      onSuccess: (next) => {
        setState(next);
        router.refresh();
      },
      onError: () => setState(initial),
    }),
  );

  // Optimistic: apply the same rules as the server, then confirm.
  const patch = (p: Partial<ShelfState>) => {
    setState((s) => applyShelfPatch(s, p));
    update.mutate({ workId: book.id, patch: p });
  };

  const toggle = (
    key: "read" | "liked" | "readingList",
    label: string,
    on: string,
    Icon: typeof Heart,
    color: string,
  ) => (
    <button
      type="button"
      onClick={() => patch({ [key]: !state[key] })}
      className="flex flex-1 flex-col items-center gap-1 py-3 text-xs text-muted hover:text-text"
      aria-pressed={state[key]}
    >
      <Icon
        className="size-7"
        style={{ color: state[key] ? color : undefined }}
        strokeWidth={1.5}
      />
      {state[key] ? on : label}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-md bg-surface-2 text-sm">
      <div className="flex border-b border-border">
        {toggle("read", "Read", "Read", BookCheck, "var(--color-read)")}
        {toggle("liked", "Like", "Liked", Heart, "var(--color-like)")}
        {toggle("readingList", "Reading list", "On list", Bookmark, "var(--color-list)")}
      </div>

      <div className="flex flex-col items-center gap-1 border-b border-border py-3">
        <span className="text-xs text-muted">{state.rating ? "Rated" : "Rate"}</span>
        <StarInput value={state.rating} onChange={(rating) => patch({ rating })} />
      </div>

      <div className="flex border-b border-border text-xs">
        <button
          type="button"
          onClick={() => patch({ currentlyReading: !state.currentlyReading })}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-muted hover:text-text"
          aria-pressed={state.currentlyReading}
        >
          <BookOpen className={`size-4 ${state.currentlyReading ? "text-read" : ""}`} />
          {state.currentlyReading ? "Reading now" : "Start reading"}
        </button>
        <button
          type="button"
          onClick={() => patch({ dnf: !state.dnf })}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-muted hover:text-text"
          aria-pressed={state.dnf}
        >
          <XCircle className={`size-4 ${state.dnf ? "text-like" : ""}`} />
          {state.dnf ? "Didn't finish" : "Didn't finish?"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setLogOpen(true)}
        className="block w-full border-b border-border py-2.5 text-center hover:bg-surface hover:text-text"
      >
        Review or log…
      </button>
      <button
        type="button"
        disabled
        className="block w-full border-b border-border py-2.5 text-center text-muted/50"
        title="Lists arrive with the social features"
      >
        Add to lists…
      </button>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex w-full items-center justify-center gap-1.5 py-2.5 text-muted hover:text-text"
      >
        <Share2 className="size-4" /> {copied ? "Link copied" : "Share"}
      </button>

      <LogDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        book={book}
        defaults={{ rating: state.rating, liked: state.liked, reread: state.read }}
        onSaved={(shelf) => {
          setState(shelf);
          router.refresh();
        }}
      />
    </div>
  );
}
