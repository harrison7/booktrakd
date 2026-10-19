"use client";

import type { AppRouter, BookCard } from "@booktrakd/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Cover } from "@/components/cover";
import { starsText } from "@/components/rating";
import { useTRPC } from "@/lib/trpc";

type Preview = inferRouterOutputs<AppRouter>["imports"]["preview"];
type PreviewRow = Preview["rows"][number];

const BATCH = 200;
const STATUS_LABEL = {
  read: "Read",
  "to-read": "Reading list",
  reading: "Currently reading",
  dnf: "Didn't finish",
} as const;

export function Importer({ username }: { username: string }) {
  const trpc = useTRPC();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ books: number; entries: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = useMutation(
    trpc.imports.preview.mutationOptions({
      onSuccess: (data) => {
        setPreview(data);
        setRows(data.rows);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );
  const commitMutation = useMutation(trpc.imports.commit.mutationOptions());

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    previewMutation.mutate({ csv: await file.text() });
  };

  const matched = rows.filter((r) => r.match);
  const unmatched = rows.filter((r) => !r.match);

  const run = async () => {
    if (!preview) return;
    setError(null);
    const toSend = matched.map(({ match, title: _t, authors: _a, isbn13: _i, ...row }) => ({
      ...row,
      workId: (match as BookCard).id,
    }));
    let importId: number | null = null;
    let books = 0;
    let entries = 0;
    setProgress({ done: 0, total: toSend.length });
    try {
      for (let i = 0; i < toSend.length || i === 0; i += BATCH) {
        const final = i + BATCH >= toSend.length;
        const res = await commitMutation.mutateAsync({
          importId,
          source: preview.source,
          rows: toSend.slice(i, i + BATCH),
          unmatched: i === 0 ? unmatched.length : 0,
          final,
        });
        importId = res.importId;
        books += res.books;
        entries += res.entries;
        setProgress({ done: Math.min(i + BATCH, toSend.length), total: toSend.length });
        if (final) break;
      }
      setResult({ books, entries });
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setProgress(null);
    }
  };

  if (result) {
    return (
      <div className="rounded-md bg-surface p-6 text-center">
        <p className="font-serif text-2xl">Import complete</p>
        <p className="mt-2 text-sm text-muted">
          {result.books.toLocaleString()} books added, {result.entries.toLocaleString()} diary
          entries created.
        </p>
        <Link href={`/${username}` as never} className="mt-4 inline-block text-read underline">
          See your profile
        </Link>
      </div>
    );
  }

  if (!preview) {
    return (
      <div>
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center hover:border-read">
          <Upload className="size-8 text-muted" />
          <span className="font-semibold">
            {previewMutation.isPending ? "Reading your export…" : "Choose your export CSV"}
          </span>
          <span className="text-xs text-muted">
            goodreads_library_export.csv or StoryGraph's export
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={previewMutation.isPending}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {error && <p className="mt-3 text-sm text-like">{error}</p>}
      </div>
    );
  }

  const counts = matched.reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? (r.rating ? "read" : "other");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-md bg-surface p-5">
        <p className="font-serif text-xl">
          Found {matched.length.toLocaleString()} of {rows.length.toLocaleString()} books from{" "}
          {preview.source === "goodreads" ? "Goodreads" : "StoryGraph"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {Object.entries(counts)
            .map(
              ([k, n]) =>
                `${n.toLocaleString()} ${STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? "rated only"}`,
            )
            .join(" · ")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={progress != null || matched.length === 0}
            className="rounded bg-read px-5 py-2 font-semibold text-bg hover:brightness-110 disabled:opacity-50"
          >
            {progress
              ? `Importing… ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
              : `Import ${matched.length.toLocaleString()} books`}
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            disabled={progress != null}
            className="text-sm text-muted hover:text-text"
          >
            Choose a different file
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-like">{error}</p>}
      </div>

      {unmatched.length > 0 && (
        <section>
          <h2 className="mb-1 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
            Not found ({unmatched.length.toLocaleString()})
          </h2>
          <p className="mb-3 text-xs text-muted">Find these yourself, or they'll be skipped.</p>
          <ul className="divide-y divide-border">
            {unmatched.slice(0, 300).map((row) => (
              <UnmatchedRow
                key={`${row.title}|${row.authors[0] ?? ""}|${row.isbn13 ?? ""}`}
                row={row}
                onMatch={(book) =>
                  setRows((all) => all.map((r) => (r === row ? { ...r, match: book } : r)))
                }
              />
            ))}
          </ul>
          {unmatched.length > 300 && (
            <p className="mt-2 text-xs text-muted">…and {unmatched.length - 300} more.</p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
          Matched
        </h2>
        <ul className="divide-y divide-border">
          {matched.slice(0, 100).map((row) => (
            <li
              key={`${row.title}|${row.match?.id}`}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <Cover
                cover={row.match?.cover ?? null}
                title={row.match?.title ?? row.title}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{row.match?.title}</p>
                <p className="truncate text-xs text-muted">{row.match?.authors}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {row.status ? STATUS_LABEL[row.status] : ""}
                {row.rating ? (
                  <span className="ml-2 text-star">{starsText(row.rating)}</span>
                ) : null}
                {row.dateRead ? ` · ${row.dateRead}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {matched.length > 100 && (
          <p className="mt-2 text-xs text-muted">…and {matched.length - 100} more.</p>
        )}
      </section>
    </div>
  );
}

function UnmatchedRow({ row, onMatch }: { row: PreviewRow; onMatch: (book: BookCard) => void }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(
    `${row.title.replace(/\s*\([^)]*#[\d.]+\)$/, "")} ${row.authors[0] ?? ""}`,
  );
  const results = useQuery({
    ...trpc.search.books.queryOptions({ q, limit: 5 }),
    enabled: open && q.trim().length > 1,
  });
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate">{row.title}</p>
          <p className="truncate text-xs text-muted">{row.authors.join(", ")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded bg-surface-2 px-2.5 py-1 text-xs hover:text-read"
        >
          {open ? "Close" : "Find"}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded bg-surface-2 px-3 py-1.5"
          />
          <ul className="mt-1">
            {results.data?.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onMatch(b)}
                  className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-surface"
                >
                  <Cover cover={b.cover} title={b.title} size="xs" />
                  <span>
                    <span className="font-semibold">{b.title}</span>{" "}
                    <span className="text-muted">
                      {b.year} {b.authors && `· ${b.authors}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {results.data?.length === 0 && <li className="px-2 py-1.5 text-muted">No results</li>}
          </ul>
        </div>
      )}
    </li>
  );
}
