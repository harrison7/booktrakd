"use client";

import type { BookCard } from "@booktrakd/api";
import { EMPTY_SHELF } from "@booktrakd/api/shelf-rules";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Cover } from "./cover";
import { LogDialog } from "./log-dialog";

/** Header "+ Log" button: search for any book, then log it. */
export function LogLauncher() {
  const trpc = useTRPC();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [book, setBook] = useState<BookCard | null>(null);

  const results = useQuery({
    ...trpc.search.books.queryOptions({ q, limit: 8 }),
    enabled: open && q.trim().length > 1,
  });
  const shelf = useQuery({
    ...trpc.users.shelves.queryOptions({ workIds: book ? [book.id] : [] }),
    enabled: book != null,
  });

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  const state = (book && shelf.data?.[book.id]) || EMPTY_SHELF;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
        className="flex items-center gap-1 rounded bg-read px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap text-bg hover:brightness-110"
      >
        <Plus className="size-4" strokeWidth={3} />
        <span className="hidden sm:inline">Log</span>
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className="m-auto mt-24 w-full max-w-lg rounded-lg bg-surface p-0 text-text shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which book did you read?"
            aria-label="Search for a book to log"
            className="flex-1 bg-transparent px-2 py-1 text-lg placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {results.data?.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setBook(b);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
              >
                <Cover cover={b.cover} title={b.title} size="xs" />
                <span>
                  <span className="font-semibold">{b.title}</span>{" "}
                  <span className="text-sm text-muted">{b.year}</span>
                  {b.authors && <span className="block text-sm text-muted">{b.authors}</span>}
                </span>
              </button>
            </li>
          ))}
          {results.data?.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No books found</li>
          )}
        </ul>
      </dialog>

      {book && (
        <LogDialog
          // Wait for the shelf so the dialog opens with the current rating/like.
          open={shelf.isSuccess}
          onClose={() => setBook(null)}
          book={book}
          defaults={{ rating: state.rating, liked: state.liked, reread: state.read }}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
