"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type EditableEntry, LogDialog } from "@/components/log-dialog";

export function EditEntry({
  entry,
  book,
}: {
  entry: EditableEntry;
  book: { id: number; title: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-text"
      >
        Edit entry
      </button>
      <LogDialog
        open={open}
        onClose={() => setOpen(false)}
        book={book}
        entry={entry}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
