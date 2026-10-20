import { MemberList } from "@/components/member-list";
import { Pager } from "@/components/pager";
import { orNotFound, serverApi } from "@/server/api";

export default async function FollowingPage(props: PageProps<"/[username]/following">) {
  const { username } = await props.params;
  const offset = Number((await props.searchParams).offset) || 0;
  const api = await serverApi();
  const [{ members, nextOffset }, me] = await Promise.all([
    orNotFound(api.social.network({ username, direction: "following", offset })),
    api.users.me(),
  ]);
  return (
    <>
      <MemberList
        members={members}
        viewer={me?.username ?? null}
        empty="Not following anyone yet."
      />
      <Pager base={`/${username}/following?`} offset={offset} nextOffset={nextOffset} />
    </>
  );
}
