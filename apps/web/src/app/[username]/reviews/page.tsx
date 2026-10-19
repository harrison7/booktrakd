import { Pager } from "@/components/pager";
import { ReviewCard } from "@/components/review-card";
import { orNotFound, serverApi } from "@/server/api";

export default async function UserReviewsPage(props: PageProps<"/[username]/reviews">) {
  const { username } = await props.params;
  const offset = Number((await props.searchParams).offset) || 0;
  const { reviews, nextOffset } = await orNotFound(
    (await serverApi()).entries.reviews({ username, sort: "recent", offset }),
  );
  return (
    <div className="max-w-3xl">
      {reviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
      <div className="divide-y divide-border">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} book={r.book} />
        ))}
      </div>
      <Pager base={`/${username}/reviews?`} offset={offset} nextOffset={nextOffset} pageSize={30} />
    </div>
  );
}
