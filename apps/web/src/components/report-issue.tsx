"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTRPC } from "@/lib/trpc";

const KINDS = [
  ["wrong_cover", "Wrong or bad cover"],
  ["duplicate", "Duplicate of another book"],
  ["wrong_author", "Wrong author"],
  ["wrong_info", "Wrong title, year or description"],
  ["offensive", "Offensive content"],
  ["other", "Something else"],
] as const;

/** "Report an issue" — sends catalog problems to the librarian queue. */
export function ReportIssue({
  objectType,
  objectId,
  signedIn,
}: {
  objectType: "work" | "author";
  objectId: number;
  signedIn: boolean;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("wrong_cover");
  const [details, setDetails] = useState("");
  const report = useMutation(trpc.reports.catalog.mutationOptions());

  if (!signedIn) return null;
  if (report.isSuccess) {
    return <p className="mt-10 text-xs text-muted">Thanks — a librarian will take a look.</p>;
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 text-xs text-muted hover:text-text"
      >
        Report an issue with this {objectType === "work" ? "book" : "author"}
      </button>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    report.mutate({ objectType, objectId, kind, details });
  };
  return (
    <form
      onSubmit={submit}
      className="mt-10 flex max-w-md flex-col gap-2 rounded-md bg-surface p-4 text-sm"
    >
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className="rounded bg-surface-2 px-2 py-1.5"
      >
        {KINDS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Details (e.g. a link to the duplicate)"
        rows={3}
        className="rounded bg-surface-2 p-2"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1 text-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={report.isPending}
          className="rounded bg-read px-3 py-1 font-semibold text-bg"
        >
          Send
        </button>
      </div>
    </form>
  );
}
