"use client";

import type { ShelfState } from "@booktrakd/api/shelf-rules";
import { useMutation } from "@tanstack/react-query";
import { Heart, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { StarInput } from "./star-input";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

const FORMATS = [
  ["", "Format (optional)"],
  ["hardcover", "Hardcover"],
  ["paperback", "Paperback"],
  ["ebook", "Ebook"],
  ["audiobook", "Audiobook"],
] as const;

/** "I read…" modal: date, rating, like, reread/DNF, format, review, tags. */
export function LogDialog({
  open,
  onClose,
  book,
  defaults,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  book: { id: number; title: string };
  defaults: { rating: number | null; liked: boolean; reread: boolean };
  onSaved: (shelf: ShelfState) => void;
}) {
  const trpc = useTRPC();
  const ref = useRef<HTMLDialogElement>(null);
  const [hasDate, setHasDate] = useState(true);
  const [finishedOn, setFinishedOn] = useState(today);
  const [rating, setRating] = useState(defaults.rating);
  const [liked, setLiked] = useState(defaults.liked);
  const [reread, setReread] = useState(defaults.reread);
  const [dnf, setDnf] = useState(false);
  const [format, setFormat] = useState("");
  const [review, setReview] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [tags, setTags] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) {
      // Reset to the book's current state each time it opens.
      setRating(defaults.rating);
      setLiked(defaults.liked);
      setReread(defaults.reread);
      setFinishedOn(today());
      dialog?.showModal();
    }
    if (!open && dialog?.open) dialog.close();
  }, [open, defaults.rating, defaults.liked, defaults.reread]);

  const create = useMutation(
    trpc.entries.create.mutationOptions({
      onSuccess: ({ shelf }) => {
        onSaved(shelf);
        setReview("");
        setTags("");
        setSpoilers(false);
        setDnf(false);
        onClose();
      },
    }),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      workId: book.id,
      finishedOn: hasDate ? finishedOn : null,
      rating,
      liked,
      reread,
      dnf,
      format: format ? (format as "hardcover") : null,
      review: review.trim() || null,
      spoilers,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-xl rounded-lg bg-surface p-0 text-text shadow-2xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">I read…</p>
            <h2 className="font-serif text-2xl">{book.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasDate}
              onChange={(e) => setHasDate(e.target.checked)}
            />
            {dnf ? "Stopped on" : "Finished on"}
          </label>
          <input
            type="date"
            value={finishedOn}
            max={today()}
            disabled={!hasDate}
            onChange={(e) => setFinishedOn(e.target.value)}
            className="rounded bg-surface-2 px-2 py-1 disabled:opacity-40"
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reread} onChange={(e) => setReread(e.target.checked)} />
            I've read this before
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dnf} onChange={(e) => setDnf(e.target.checked)} />
            Didn't finish
          </label>
        </div>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Add a review…"
          rows={6}
          maxLength={20000}
          className="w-full resize-y rounded bg-surface-2 p-3 font-serif text-base placeholder:text-muted"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma separated"
            className="min-w-0 flex-1 rounded bg-surface-2 px-3 py-1.5 placeholder:text-muted"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded bg-surface-2 px-2 py-1.5"
          >
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <StarInput value={rating} onChange={setRating} size={26} />
            <button
              type="button"
              onClick={() => setLiked(!liked)}
              aria-pressed={liked}
              aria-label="Like"
            >
              <Heart
                className="size-6"
                fill={liked ? "var(--color-like)" : "none"}
                color={liked ? "var(--color-like)" : "var(--color-muted)"}
              />
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={spoilers}
              disabled={!review.trim()}
              onChange={(e) => setSpoilers(e.target.checked)}
            />
            Contains spoilers
          </label>
        </div>

        {create.error && <p className="text-sm text-like">{create.error.message}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-read px-5 py-2 font-semibold text-bg hover:brightness-110 disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
