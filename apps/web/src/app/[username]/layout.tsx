import type { Metadata } from "next";
import Link from "next/link";
import { FollowButton, ProfileMenu } from "@/components/follow-button";
import { Avatar } from "@/components/header-client";
import { serverApi } from "@/server/api";
import { getProfile } from "./profile";
import { ProfileTabs } from "./tabs";

export async function generateMetadata(props: LayoutProps<"/[username]">): Promise<Metadata> {
  const profile = await getProfile((await props.params).username);
  return { title: `${profile.displayName} (@${profile.username})` };
}

export default async function ProfileLayout(props: LayoutProps<"/[username]">) {
  const profile = await getProfile((await props.params).username);
  const me = await (await serverApi()).users.me();
  const base = `/${profile.username}`;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={profile.displayName} size={88} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold">{profile.displayName}</h1>
            {profile.isPatron && (
              <span className="rounded bg-star/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-star">
                Patron
              </span>
            )}
            {profile.isMe && (
              <Link
                href="/settings"
                className="rounded bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted hover:text-text"
              >
                Edit profile
              </Link>
            )}
            {!profile.isMe && !profile.viewer.blockedBy && !profile.viewer.blocks && (
              <FollowButton
                username={profile.username}
                following={profile.viewer.follows}
                signedIn={!!me}
                small
              />
            )}
            {!profile.isMe && me && (
              <ProfileMenu username={profile.username} blocking={profile.viewer.blocks} />
            )}
          </div>
          <p className="text-sm text-muted">
            @{profile.username}
            {profile.location && ` · ${profile.location}`}
            {profile.website && (
              <>
                {" · "}
                <a href={profile.website} rel="nofollow noopener" className="hover:text-text">
                  {profile.website.replace(/^https?:\/\//, "")}
                </a>
              </>
            )}
          </p>
          {profile.bio && <p className="mt-2 max-w-2xl text-sm">{profile.bio}</p>}
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-3 text-center">
          {(
            [
              ["Books", profile.counts.read, `${base}/books`],
              ["This year", profile.counts.thisYear, `${base}/diary`],
              ["Reviews", profile.counts.reviews, `${base}/reviews`],
              ["Reading list", profile.counts.readingList, `${base}/reading-list`],
              ["Following", profile.counts.following, `${base}/following`],
              ["Followers", profile.counts.followers, `${base}/followers`],
            ] as const
          ).map(([label, value, href]) => (
            <Link key={label} href={href as never} className="group">
              <dd className="font-serif text-2xl group-hover:text-read">
                {value.toLocaleString()}
              </dd>
              <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
            </Link>
          ))}
        </dl>
      </header>
      <ProfileTabs base={base} />
      <div className="pt-8">{props.children}</div>
    </div>
  );
}
