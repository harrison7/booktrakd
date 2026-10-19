"use client";

import { applyShelfPatch, EMPTY_SHELF, type ShelfState } from "@booktrakd/api/shelf-rules";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookCheck, Bookmark, Heart } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useTRPC } from "@/lib/trpc";

interface Shelves {
  states: Record<number, ShelfState>;
  update: (workId: number, patch: Partial<ShelfState>) => void;
}

const ShelvesContext = createContext<Shelves | null>(null);

/** Loads the viewer's shelf state for every book in a grid with one request. */
export function ShelvesProvider({ workIds, children }: { workIds: number[]; children: ReactNode }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.users.shelves.queryOptions({ workIds }));
  const [states, setStates] = useState<Record<number, ShelfState>>({});
  useEffect(() => {
    if (query.data) setStates(query.data);
  }, [query.data]);

  const mutation = useMutation(trpc.shelf.update.mutationOptions());
  const update = (workId: number, patch: Partial<ShelfState>) => {
    const before = states[workId] ?? EMPTY_SHELF;
    setStates((s) => ({ ...s, [workId]: applyShelfPatch(before, patch) })); // optimistic
    mutation.mutate(
      { workId, patch },
      {
        onSuccess: (next) => setStates((s) => ({ ...s, [workId]: next })),
        onError: () => setStates((s) => ({ ...s, [workId]: before })),
      },
    );
  };
  return <ShelvesContext.Provider value={{ states, update }}>{children}</ShelvesContext.Provider>;
}

/**
 * Read / like / reading-list toggles shown when hovering a cover (or tabbing into it).
 * Rendered next to the cover link, not inside it, so the buttons aren't nested in a link.
 */
export function QuickActions({ workId }: { workId: number }) {
  const shelves = useContext(ShelvesContext);
  if (!shelves) return null;
  const state = shelves.states[workId] ?? EMPTY_SHELF;
  const button = (
    key: "read" | "liked" | "readingList",
    label: string,
    Icon: typeof Heart,
    color: string,
  ) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={state[key]}
      title={label}
      onClick={() => shelves.update(workId, { [key]: !state[key] })}
      className="rounded p-1 hover:bg-white/10"
    >
      <Icon
        className="size-4"
        style={{ color: state[key] ? color : "#e6e8eb" }}
        fill={key === "liked" && state.liked ? color : "none"}
      />
    </button>
  );
  return (
    <>
      {/* Always-visible marker for books the viewer has read */}
      {state.read && (
        <span
          className="pointer-events-none absolute top-1 right-1 size-2.5 rounded-full bg-read ring-2 ring-bg"
          aria-hidden
        />
      )}
      <div className="absolute inset-x-1 bottom-1 flex justify-center gap-1 rounded bg-bg/85 py-0.5 opacity-0 backdrop-blur transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
        {button(
          "read",
          state.read ? "Remove from read" : "Mark as read",
          BookCheck,
          "var(--color-read)",
        )}
        {button("liked", state.liked ? "Unlike" : "Like", Heart, "var(--color-like)")}
        {button(
          "readingList",
          state.readingList ? "Remove from reading list" : "Add to reading list",
          Bookmark,
          "var(--color-list)",
        )}
      </div>
    </>
  );
}
