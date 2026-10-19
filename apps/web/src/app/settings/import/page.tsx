import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { serverApi } from "@/server/api";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import & export" };

export default async function ImportPage() {
  const me = await (await serverApi()).users.me();
  if (!me?.username) redirect("/sign-in?next=/settings/import");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-10">
      <div>
        <p className="text-sm text-muted">
          <Link href="/settings" className="hover:text-text">
            Settings
          </Link>
        </p>
        <h1 className="font-serif text-3xl">Import your books</h1>
        <p className="mt-2 text-sm text-muted">
          Bring your history from Goodreads (<em>My Books → Import and export → Export library</em>)
          or StoryGraph (<em>Manage account → Export StoryGraph library</em>). Ratings, read dates,
          reviews, shelves and your want-to-read list come across.
        </p>
      </div>
      <Importer username={me.username} />
      <section>
        <h2 className="mb-3 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
          Export your data
        </h2>
        <p className="mb-3 text-sm text-muted">Your data is yours. Download it any time as CSV.</p>
        <div className="flex gap-3 text-sm">
          <a
            href="/api/export/library.csv"
            className="rounded bg-surface-2 px-3 py-2 hover:text-read"
          >
            Library (books, ratings, lists)
          </a>
          <a
            href="/api/export/diary.csv"
            className="rounded bg-surface-2 px-3 py-2 hover:text-read"
          >
            Diary & reviews
          </a>
        </div>
      </section>
    </div>
  );
}
