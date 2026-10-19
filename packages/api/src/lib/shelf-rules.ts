// Pure shelf rules with no server imports, so client components can apply them
// optimistically (import from "@booktrakd/api/shelf-rules").

export interface ShelfState {
  read: boolean;
  liked: boolean;
  /** 1–10 (half stars), or null */
  rating: number | null;
  readingList: boolean;
  currentlyReading: boolean;
  dnf: boolean;
}

export const EMPTY_SHELF: ShelfState = {
  read: false,
  liked: false,
  rating: null,
  readingList: false,
  currentlyReading: false,
  dnf: false,
};

export type ShelfPatch = Partial<ShelfState>;

/**
 * Applies Letterboxd-style implications to a patch:
 * - reading, rating or liking a book marks it read and ends any reading / reading-list / DNF
 * - starting a book (or adding it to the reading list) clears DNF and the other "next" state
 * - DNF ends "currently reading" and removes it from the reading list
 * A previously read book can still be started again or added to the reading list (rereads).
 */
export function applyShelfPatch(current: ShelfState, patch: ShelfPatch): ShelfState {
  const next = { ...current, ...patch };
  if (patch.read === true || patch.rating != null || patch.liked === true) {
    next.read = true;
    next.readingList = false;
    next.currentlyReading = false;
    next.dnf = false;
  }
  if (patch.currentlyReading === true) {
    next.readingList = false;
    next.dnf = false;
  }
  if (patch.readingList === true) {
    next.currentlyReading = false;
    next.dnf = false;
  }
  if (patch.dnf === true) {
    next.currentlyReading = false;
    next.readingList = false;
  }
  return next;
}
