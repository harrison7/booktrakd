import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Feed } from "@/components/feed";
import { serverApi } from "@/server/api";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage(props: PageProps<"/activity">) {
  const api = await serverApi();
  const me = await api.users.me();
  if (!me) redirect("/sign-in");
  const before = Number((await props.searchParams).before) || undefined;
  const { items, nextCursor } = await api.social.feed({ cursor: before });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        From people you follow
      </h1>
      <Feed
        items={items}
        empty={
          before
            ? "That's everything."
            : "Nothing yet. Follow other readers from their profiles to see what they're reading."
        }
      />
      <nav className="mt-8 flex justify-between text-sm">
        {before ? (
          <Link href="/activity" className="text-muted hover:text-text">
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {nextCursor != null && (
          <Link
            href={`/activity?before=${nextCursor}` as never}
            className="text-muted hover:text-text"
          >
            Older →
          </Link>
        )}
      </nav>
    </div>
  );
}
