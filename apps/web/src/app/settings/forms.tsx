"use client";

import type { BookCard } from "@booktrakd/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Cover } from "@/components/cover";
import { useTRPC } from "@/lib/trpc";

const input =
  "w-full rounded bg-surface-2 px-3 py-2 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-read";
const saveButton =
  "rounded bg-read px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-50";

function Saved({ show }: { show: boolean }) {
  return show ? <span className="text-sm text-read">Saved</span> : null;
}

export function ProfileForm({
  initial,
}: {
  initial: { name: string; bio: string; location: string; website: string };
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const save = useMutation(
    trpc.users.updateProfile.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: form.name,
      bio: form.bio || null,
      location: form.location || null,
      website: form.website || null,
    });
  };
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
  });
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Display name
        <input {...field("name")} required maxLength={60} className={input} />
      </label>
      <label className="text-sm">
        Location
        <input {...field("location")} maxLength={60} className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        Website
        <input {...field("website")} type="url" placeholder="https://" className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        Bio
        <textarea {...field("bio")} rows={3} maxLength={500} className={input} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={save.isPending} className={saveButton}>
          Save profile
        </button>
        <Saved show={save.isSuccess} />
        {save.error && <span className="text-sm text-like">{save.error.message}</span>}
      </div>
    </form>
  );
}

/** Pick up to four favorite books via search. */
export function FavoritesForm({ initial }: { initial: BookCard[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [picks, setPicks] = useState(initial);
  const [q, setQ] = useState("");
  const results = useQuery({
    ...trpc.search.books.queryOptions({ q, limit: 8 }),
    enabled: q.trim().length > 1,
  });
  const save = useMutation(
    trpc.users.setFavorites.mutationOptions({ onSuccess: () => router.refresh() }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => {
          const book = picks[i];
          return book ? (
            <div key={book.id} className="relative">
              <Cover cover={book.cover} title={book.title} authors={book.authors} size="md" fluid />
              <button
                type="button"
                aria-label={`Remove ${book.title}`}
                onClick={() => setPicks(picks.filter((p) => p.id !== book.id))}
                className="absolute top-1 right-1 rounded-full bg-bg/80 p-1"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div
              key={`empty-${i}`}
              className="flex aspect-[2/3] items-center justify-center rounded-[3px] border border-dashed border-border text-muted"
            >
              <Plus className="size-6" />
            </div>
          );
        })}
      </div>
      {picks.length < 4 && (
        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a book to add…"
            className={input}
          />
          {results.data && results.data.length > 0 && (
            <ul className="mt-1 max-h-72 overflow-y-auto rounded bg-surface-2">
              {results.data
                .filter((b) => !picks.some((p) => p.id === b.id))
                .map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicks([...picks, b]);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
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
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate({ workIds: picks.map((p) => p.id) })}
          className={saveButton}
        >
          Save favorites
        </button>
        <Saved show={save.isSuccess} />
      </div>
    </div>
  );
}

export function GoalForm({ initial }: { initial: number | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [target, setTarget] = useState(initial?.toString() ?? "");
  const save = useMutation(
    trpc.users.setReadingGoal.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ target: target ? Number(target) : null });
      }}
      className="flex items-center gap-3 text-sm"
    >
      Read
      <input
        type="number"
        min={1}
        max={1000}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-24 rounded bg-surface-2 px-3 py-2"
        placeholder="—"
      />
      books this year
      <button type="submit" disabled={save.isPending} className={saveButton}>
        Save goal
      </button>
      <Saved show={save.isSuccess} />
    </form>
  );
}
