import { MemberList } from "@/components/member-list";
import { Pager } from "@/components/pager";
import { orNotFound, serverApi } from "@/server/api";

export default async function FollowersPage(props: PageProps<"/[username]/followers">) {
  const { username } = await props.params;
  const offset = Number((await props.searchParams).offset) || 0;
  const api = await serverApi();
  const [{ members, nextOffset }, me] = await Promise.all([
    orNotFound(api.social.network({ username, direction: "followers", offset })),
    api.users.me(),
  ]);
  return (
    <>
      <MemberList members={members} viewer={me?.username ?? null} empty="No followers yet." />
      <Pager base={`/${username}/followers?`} offset={offset} nextOffset={nextOffset} />
    </>
  );
}
