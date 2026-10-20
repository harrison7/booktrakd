import type { Member } from "@booktrakd/api";
import Link from "next/link";
import { FollowButton } from "./follow-button";
import { Avatar } from "./header-client";

/** Rows of members with their books-read count and a follow button. */
export function MemberList({
  members,
  viewer,
  empty,
}: {
  members: Member[];
  /** The signed-in viewer's username, or null when signed out. */
  viewer: string | null;
  empty: string;
}) {
  if (members.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="max-w-2xl divide-y divide-border">
      {members.map((m) => (
        <li key={m.username} className="flex items-center gap-4 py-3">
          <Avatar name={m.displayName} size={40} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/${m.username}` as never}
              className="block truncate font-semibold hover:text-read"
            >
              {m.displayName}
            </Link>
            <p className="text-xs text-muted">
              {m.readCount.toLocaleString()} {m.readCount === 1 ? "book" : "books"}
            </p>
          </div>
          {m.username !== viewer && (
            <FollowButton
              username={m.username}
              following={m.viewerFollows}
              signedIn={viewer != null}
              small
            />
          )}
        </li>
      ))}
    </ul>
  );
}
