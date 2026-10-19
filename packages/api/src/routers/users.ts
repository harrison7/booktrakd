import { type Database, rowsOf, sql } from "@booktrakd/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { queryCards } from "../lib/cards";
import { getShelves } from "../lib/shelf";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { reviewColumns, toReview } from "./entries";

type Row = Record<string, unknown>;

export async function userIdByUsername(db: Database, username: string): Promise<string> {
  const [row] = rowsOf<{ id: string }>(
    await db.execute(sql`select id from users where username = ${username.toLowerCase()}`),
  );
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  return row.id;
}

const stripRow = <T extends { row: unknown }>({ row: _row, ...rest }: T) => rest;

export const usersRouter = router({
  /** Signed-in user's basics, for the nav bar. */
  me: publicProcedure.query(({ ctx }) => ctx.user),

  profile: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const [u] = rowsOf<Row>(
        await ctx.db.execute(
          sql`select * from users where username = ${input.username.toLowerCase()}`,
        ),
      );
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      const userId = u.id as string;
      const year = new Date().getFullYear();

      const [counts, histogram, goal, favorites, reading, recent, reviews] = await Promise.all([
        ctx.db.execute(sql`
          select
            (select count(*) from user_works where user_id = ${userId} and is_read)::int as read,
            (select count(distinct work_id) from entries
             where user_id = ${userId} and not is_dnf
               and extract(year from finished_on) = ${year})::int as this_year,
            (select count(*) from entries
             where user_id = ${userId} and review_text is not null)::int as reviews,
            (select count(*) from user_works
             where user_id = ${userId} and on_reading_list)::int as reading_list
        `),
        ctx.db.execute(sql`
          select array(
            select count(u.rating)::int from generate_series(1, 10) g
            left join user_works u on u.user_id = ${userId} and u.rating = g
            group by g order by g
          ) as histogram
        `),
        ctx.db.execute(
          sql`select target from reading_goals where user_id = ${userId} and year = ${year}`,
        ),
        queryCards(
          ctx.db,
          sql`join favorites f on f.work_id = w.id where f.user_id = ${userId} order by f.position`,
        ),
        queryCards(
          ctx.db,
          sql`join user_works uw on uw.work_id = w.id
              where uw.user_id = ${userId} and uw.is_currently_reading
              order by uw.updated_at desc limit 6`,
        ),
        queryCards(
          ctx.db,
          sql`join entries e on e.work_id = w.id join users u on u.id = e.user_id
              where e.user_id = ${userId}
              order by coalesce(e.finished_on, e.created_at::date) desc, e.created_at desc limit 6`,
          reviewColumns,
        ),
        queryCards(
          ctx.db,
          sql`join entries e on e.work_id = w.id join users u on u.id = e.user_id
              where e.user_id = ${userId} and e.review_text is not null
              order by e.created_at desc limit 3`,
          reviewColumns,
        ),
      ]);
      const c = rowsOf<Row>(counts)[0] ?? {};
      return {
        username: u.username as string,
        displayName: (u.name as string) || (u.display_username as string),
        image: (u.image as string | null) ?? null,
        bio: (u.bio as string | null) ?? null,
        location: (u.location as string | null) ?? null,
        website: (u.website as string | null) ?? null,
        isPatron: Boolean(u.is_patron),
        joinedAt: new Date(u.created_at as string),
        isMe: ctx.user?.id === userId,
        counts: {
          read: Number(c.read ?? 0),
          thisYear: Number(c.this_year ?? 0),
          reviews: Number(c.reviews ?? 0),
          readingList: Number(c.reading_list ?? 0),
        },
        histogram: ((rowsOf<Row>(histogram)[0]?.histogram as number[]) ?? []).map(Number),
        goal: rowsOf<Row>(goal)[0] ? { year, target: Number(rowsOf<Row>(goal)[0]?.target) } : null,
        favorites: favorites.map(stripRow),
        currentlyReading: reading.map(stripRow),
        recentEntries: recent.map(({ row, ...book }) => ({ ...toReview(row), book })),
        recentReviews: reviews.map(({ row, ...book }) => ({ ...toReview(row), book })),
      };
    }),

  /** Books a user has read, as a cover grid with their rating/like. */
  books: publicProcedure
    .input(
      z.object({
        username: z.string(),
        sort: z.enum(["recent", "rating", "title"]).default("recent"),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = await userIdByUsername(ctx.db, input.username);
      const limit = 72;
      const order = {
        recent: sql`uw.updated_at desc`,
        rating: sql`uw.rating desc nulls last, uw.updated_at desc`,
        title: sql`w.title`,
      }[input.sort];
      const rows = await queryCards(
        ctx.db,
        sql`join user_works uw on uw.work_id = w.id
            where uw.user_id = ${userId} and uw.is_read
            order by ${order} limit ${limit + 1} offset ${input.offset}`,
        sql`uw.rating as user_rating, uw.is_liked as user_liked`,
      );
      return {
        books: rows.slice(0, limit).map(({ row, ...card }) => ({
          ...card,
          rating: row.user_rating == null ? null : Number(row.user_rating),
          liked: Boolean(row.user_liked),
        })),
        nextOffset: rows.length > limit ? input.offset + limit : null,
      };
    }),

  readingList: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = await userIdByUsername(ctx.db, input.username);
      const rows = await queryCards(
        ctx.db,
        sql`join user_works uw on uw.work_id = w.id
            where uw.user_id = ${userId} and uw.on_reading_list
            order by uw.reading_list_position desc limit 500`,
      );
      return rows.map(stripRow);
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        bio: z.string().trim().max(500).nullable(),
        location: z.string().trim().max(60).nullable(),
        website: z
          .url()
          .max(200)
          .nullable()
          .or(z.literal("").transform(() => null)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.execute(sql`
        update users set name = ${input.name}, bio = ${input.bio || null},
          location = ${input.location || null}, website = ${input.website}, updated_at = now()
        where id = ${ctx.user.id}
      `);
      return { ok: true };
    }),

  /** Replaces the profile's "Favorite Four". */
  setFavorites: protectedProcedure
    .input(z.object({ workIds: z.array(z.number().int()).max(4) }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.workIds)];
      await ctx.db.transaction(async (tx) => {
        await tx.execute(sql`delete from favorites where user_id = ${ctx.user.id}`);
        for (const [i, workId] of ids.entries()) {
          await tx.execute(sql`
            insert into favorites (user_id, position, work_id) values (${ctx.user.id}, ${i + 1}, ${workId})
          `);
        }
      });
      return { ok: true };
    }),

  setReadingGoal: protectedProcedure
    .input(z.object({ target: z.number().int().min(1).max(1000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const year = new Date().getFullYear();
      await ctx.db.execute(
        input.target == null
          ? sql`delete from reading_goals where user_id = ${ctx.user.id} and year = ${year}`
          : sql`insert into reading_goals (user_id, year, target)
                values (${ctx.user.id}, ${year}, ${input.target})
                on conflict (user_id, year) do update set target = excluded.target`,
      );
      return { ok: true };
    }),

  /** The viewer's shelf state for many books at once (cover-grid overlays). */
  shelves: protectedProcedure
    .input(z.object({ workIds: z.array(z.number().int()).max(500) }))
    .query(({ ctx, input }) => getShelves(ctx.db, ctx.user.id, input.workIds)),
});
