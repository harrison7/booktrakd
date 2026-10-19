import { Heart } from "lucide-react";
import Link from "next/link";
import { BookCover, CoverGrid } from "@/components/cover";
import { RatingHistogram, Stars } from "@/components/rating";
import { ReviewCard } from "@/components/review-card";
import { getProfile } from "./profile";

export default async function ProfilePage(props: PageProps<"/[username]">) {
  const profile = await getProfile((await props.params).username);
  const ratingCount = profile.histogram.reduce((a, b) => a + b, 0);
  const ratingAvg =
    ratingCount === 0
      ? null
      : profile.histogram.reduce((sum, n, i) => sum + n * (i + 1), 0) / ratingCount;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-10">
        <Section title="Favorite books">
          {profile.favorites.length === 0 ? (
            <p className="text-sm text-muted">
              {profile.isMe ? (
                <>
                  Pick your four favorites in{" "}
                  <Link href="/settings" className="text-text underline">
                    settings
                  </Link>
                  .
                </>
              ) : (
                "No favorites yet."
              )}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {profile.favorites.map((b) => (
                <BookCover key={b.id} book={b} size="lg" fluid priority />
              ))}
            </div>
          )}
        </Section>

        {profile.currentlyReading.length > 0 && (
          <Section title="Currently reading">
            <CoverGrid min={100}>
              {profile.currentlyReading.map((b) => (
                <BookCover key={b.id} book={b} size="md" fluid />
              ))}
            </CoverGrid>
          </Section>
        )}

        <Section title="Recent activity" more={`/${profile.username}/diary`}>
          {profile.recentEntries.length === 0 ? (
            <p className="text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {profile.recentEntries.map((e) => (
                <div key={e.id}>
                  <BookCover book={e.book} size="md" fluid />
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <Stars rating={e.rating} />
                    {e.liked && (
                      <Heart
                        className="size-3"
                        fill="var(--color-like)"
                        color="var(--color-like)"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {profile.recentReviews.length > 0 && (
          <Section title="Recent reviews" more={`/${profile.username}/reviews`}>
            <div className="divide-y divide-border">
              {profile.recentReviews.map((r) => (
                <ReviewCard key={r.id} review={r} book={r.book} />
              ))}
            </div>
          </Section>
        )}
      </div>

      <aside className="flex flex-col gap-8">
        {profile.goal && (
          <div>
            <h2 className="mb-2 border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
              {profile.goal.year} reading goal
            </h2>
            <p className="mb-1 text-sm">
              {profile.counts.thisYear} of {profile.goal.target} books
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-read"
                style={{
                  width: `${Math.min(100, (profile.counts.thisYear / profile.goal.target) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
        <RatingHistogram histogram={profile.histogram} average={ratingAvg} count={ratingCount} />
      </aside>
    </div>
  );
}

function Section({
  title,
  more,
  children,
}: {
  title: string;
  more?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex justify-between border-b border-border pb-1 text-xs uppercase tracking-wider text-muted">
        <span>{title}</span>
        {more && (
          <Link href={more as never} className="hover:text-text">
            All
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}
