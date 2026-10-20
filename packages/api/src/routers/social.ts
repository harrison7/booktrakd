// Follows, blocks and the friends activity feed.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { recordActivity, removeActivity } from "../lib/activity";
import { cardColumns, coverJoin, toCard } from "../lib/cards";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { userIdByUsername } from "./users";

type Row = Record<string, unknown>;

/** Whether either member has blocked the other. */
export async function isBlockedEitherWay(db: Database, a: string, b: string) {
  const rows = rowsOf(
    await db.execute(sql`
      select 1 from blocks
      where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a})
    `),
  );
  return rows.length > 0;
}

/** Resolves the target member of a follow/block, refusing yourself. */
async function otherMember(db: Database, me: string, username: string) {
  const id = await userIdByUsername(db, username);
  if (id === me) throw new TRPCError({ code: "BAD_REQUEST", message: "That's you" });
  return id;
}

async function unfollow(db: Database, followerId: string, followeeId: string) {
  await db.execute(
    sql`delete from follows where follower_id = ${followerId} and followee_id = ${followeeId}`,
  );
  await removeActivity(db, followerId, "followed", { type: "user", id: followeeId });
}

const memberColumns = sql`
  u.id, u.username, u.display_username, u.name, u.image,
  (select count(*) from user_works uw where uw.user_id = u.id and uw.is_read)::int as read_count`;

function toMember(r: Row) {
  return {
    username: r.username as string,
    displayName: (r.name as string) || (r.display_username as string) || (r.username as string),
    image: (r.image as string | null) ?? null,
    readCount: Number(r.read_count ?? 0),
    viewerFollows: Boolean(r.viewer_follows),
  };
}

export type Member = ReturnType<typeof toMember>;

function toFeedItem(r: Row) {
  const actor = {
    username: r.actor_username as string,
    displayName:
      (r.actor_name as string) ||
      (r.actor_display_username as string) ||
      (r.actor_username as string),
    image: (r.actor_image as string | null) ?? null,
  };
  const base = {
    id: Number(r.activity_id),
    createdAt: new Date(r.activity_at as string),
    actor,
    book: r.id == null ? null : toCard(r),
    // The actor's current rating, shown next to shelf activity like "rated" or "liked".
    rating: r.shelf_rating == null ? null : Number(r.shelf_rating),
  };
  const verb = r.verb as string;
  if (verb === "logged" || verb === "reviewed") {
    return {
      ...base,
      verb,
      entry: {
        id: Number(r.object_id),
        rating: r.entry_rating == null ? null : Number(r.entry_rating),
        liked: Boolean(r.entry_liked),
        reread: Boolean(r.entry_reread),
        dnf: Boolean(r.entry_dnf),
        text: (r.entry_text as string | null) ?? null,
        spoilers: Boolean(r.entry_spoilers),
      },
    } as const;
  }
  if (verb === "followed") {
    return {
      ...base,
      verb,
      target: {
        username: r.target_username as string,
        displayName:
          (r.target_name as string) ||
          (r.target_display_username as string) ||
          (r.target_username as string),
      },
    } as const;
  }
  return {
    ...base,
    verb: verb as "read" | "rated" | "liked_work" | "added_to_reading_list" | "started_reading",
  };
}

export type FeedItem = ReturnType<typeof toFeedItem>;

export const socialRouter = router({
  follow: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.user.id;
      const them = await otherMember(ctx.db, me, input.username);
      if (await isBlockedEitherWay(ctx.db, me, them)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't follow this member" });
      }
      const inserted = rowsOf(
        await ctx.db.execute(sql`
          insert into follows (follower_id, followee_id) values (${me}, ${them})
          on conflict do nothing returning 1
        `),
      );
      if (inserted.length > 0) {
        await recordActivity(ctx.db, me, "followed", { type: "user", id: them });
        // Re-following replaces the earlier notification rather than stacking another.
        await ctx.db.execute(sql`
          delete from notifications
          where user_id = ${them} and type = 'new_follower' and actor_id = ${me}
        `);
        await ctx.db.execute(sql`
          insert into notifications (user_id, type, actor_id, object_type, object_id)
          values (${them}, 'new_follower', ${me}, 'user', ${me})
        `);
      }
      return { following: true };
    }),

  unfollow: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const them = await otherMember(ctx.db, ctx.user.id, input.username);
      await unfollow(ctx.db, ctx.user.id, them);
      return { following: false };
    }),

  /** Blocking ends follows both ways and stops either member following the other. */
  block: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.user.id;
      const them = await otherMember(ctx.db, me, input.username);
      await ctx.db.execute(sql`
        insert into blocks (blocker_id, blocked_id) values (${me}, ${them}) on conflict do nothing
      `);
      await unfollow(ctx.db, me, them);
      await unfollow(ctx.db, them, me);
      return { blocking: true };
    }),

  unblock: protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const them = await otherMember(ctx.db, ctx.user.id, input.username);
      await ctx.db.execute(
        sql`delete from blocks where blocker_id = ${ctx.user.id} and blocked_id = ${them}`,
      );
      return { blocking: false };
    }),

  /** Members following `username` (followers) or followed by them (following). */
  network: publicProcedure
    .input(
      z.object({
        username: z.string(),
        direction: z.enum(["followers", "following"]),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = await userIdByUsername(ctx.db, input.username);
      const limit = 50;
      const [mine, theirs] =
        input.direction === "followers"
          ? [sql`f.followee_id`, sql`f.follower_id`]
          : [sql`f.follower_id`, sql`f.followee_id`];
      const viewer = ctx.user?.id ?? null;
      const rows = rowsOf<Row>(
        await ctx.db.execute(sql`
          select ${memberColumns},
            exists(select 1 from follows v
                   where v.follower_id = ${viewer} and v.followee_id = u.id) as viewer_follows
          from follows f join users u on u.id = ${theirs}
          where ${mine} = ${userId}
          order by f.created_at desc
          limit ${limit + 1} offset ${input.offset}
        `),
      );
      return {
        members: rows.slice(0, limit).map(toMember),
        nextOffset: rows.length > limit ? input.offset + limit : null,
      };
    }),

  /** Recent activity from the members you follow, newest first. */
  feed: protectedProcedure
    .input(
      z.object({
        // Activities are only ever inserted "now", so id order is time order: page on id.
        cursor: z.number().int().optional(),
        limit: z.number().int().min(1).max(100).default(40),
      }),
    )
    .query(async ({ ctx, input }) => {
      const before = input.cursor == null ? sql`` : sql`and a.id < ${input.cursor}`;
      const rows = rowsOf<Row>(
        await ctx.db.execute(sql`
          select a.id as activity_id, a.verb, a.object_id, a.created_at as activity_at,
            u.username as actor_username, u.name as actor_name,
            u.display_username as actor_display_username, u.image as actor_image,
            ${cardColumns},
            uw.rating as shelf_rating,
            e.rating as entry_rating, e.is_liked as entry_liked, e.is_reread as entry_reread,
            e.is_dnf as entry_dnf, e.review_text as entry_text,
            e.contains_spoilers as entry_spoilers,
            t.username as target_username, t.name as target_name,
            t.display_username as target_display_username
          from activities a
          join follows f on f.followee_id = a.actor_id and f.follower_id = ${ctx.user.id}
          join users u on u.id = a.actor_id
          left join works w on w.id = a.work_id
          ${coverJoin}
          left join user_works uw on uw.user_id = a.actor_id and uw.work_id = a.work_id
          left join entries e on a.object_type = 'entry' and e.id::text = a.object_id
          left join users t on a.object_type = 'user' and t.id = a.object_id
          where not exists (
            -- Hide "followed" items about members who blocked you, or whom you blocked.
            select 1 from blocks b
            where a.object_type = 'user'
              and ((b.blocker_id = ${ctx.user.id} and b.blocked_id = a.object_id)
                or (b.blocker_id = a.object_id and b.blocked_id = ${ctx.user.id}))
          ) ${before}
          order by a.id desc
          limit ${input.limit + 1}
        `),
      );
      const items = rows.slice(0, input.limit).map(toFeedItem);
      return { items, nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null };
    }),
});
