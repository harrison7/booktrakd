import Link from "next/link";
import { Cover, CoverGrid, GridBook } from "@/components/cover";
import { Feed } from "@/components/feed";
import { ShelvesProvider } from "@/components/quick-actions";
import { serverApi } from "@/server/api";

export default async function HomePage() {
  const api = await serverApi();
  const [me, popular] = await Promise.all([api.users.me(), api.catalog.popular({ limit: 36 })]);
  const [profile, feed] = me?.username
    ? await Promise.all([
        api.users.profile({ username: me.username }),
        api.social.feed({ limit: 8 }),
      ])
    : [null, null];

  return (
    <div>
      {!me && (
        <section className="relative overflow-hidden border-b border-border">
          {/* Cover collage backdrop */}
          <div
            className="pointer-events-none absolute inset-0 -rotate-6 scale-125 opacity-25"
            aria-hidden
          >
            <div className="grid grid-cols-8 gap-2 sm:grid-cols-12">
              {popular.slice(0, 36).map((b) => (
                <Cover key={b.id} cover={b.cover} title={b.title} size="sm" fluid />
              ))}
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-28 text-center">
            <h1 className="font-serif text-4xl leading-tight font-semibold sm:text-5xl">
              Track books you've read.
              <br />
              Save those you want to read.
              <br />
              Tell your friends what's good.
            </h1>
            <Link
              href="/sign-up"
              className="rounded bg-read px-6 py-3 font-semibold text-bg hover:brightness-110"
            >
              Get started — it's free
            </Link>
            <p className="text-sm text-muted">The social network for readers.</p>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-6xl px-4 py-10">
        {profile && (
          <>
            <h1 className="mb-8 text-center font-serif text-2xl text-muted">
              Welcome back, <span className="text-text">{profile.displayName}</span>.
            </h1>
            {profile.currentlyReading.length > 0 && (
              <Section title="Currently reading">
                <ShelvesProvider workIds={profile.currentlyReading.map((b) => b.id)}>
                  <CoverGrid min={120}>
                    {profile.currentlyReading.map((b) => (
                      <GridBook key={b.id} book={b} actions />
                    ))}
                  </CoverGrid>
                </ShelvesProvider>
              </Section>
            )}
            {feed && (
              <Section
                title="New from friends"
                more={feed.nextCursor != null ? { href: "/activity", label: "More" } : undefined}
              >
                <div className="max-w-3xl">
                  <Feed
                    items={feed.items}
                    empty="Follow other readers from their profiles to see what they're reading here."
                  />
                </div>
              </Section>
            )}
          </>
        )}
        <Section title="Popular books">
          <MaybeShelves signedIn={!!me} workIds={popular.map((b) => b.id)}>
            <CoverGrid min={120}>
              {popular.map((b, i) => (
                <GridBook key={b.id} book={b} actions={!!me} priority={i < 12} />
              ))}
            </CoverGrid>
          </MaybeShelves>
        </Section>
      </div>
    </div>
  );
}

function MaybeShelves({
  signedIn,
  workIds,
  children,
}: {
  signedIn: boolean;
  workIds: number[];
  children: React.ReactNode;
}) {
  return signedIn ? <ShelvesProvider workIds={workIds}>{children}</ShelvesProvider> : children;
}

function Section({
  title,
  more,
  children,
}: {
  title: string;
  more?: { href: "/activity"; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="mb-3 flex justify-between border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        {title}
        {more && (
          <Link href={more.href} className="hover:text-text">
            {more.label}
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}
