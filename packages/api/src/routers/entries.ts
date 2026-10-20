// Diary entries ("logs"). A review is an entry with text.
import { rowsOf, sql } from "@booktrakd/db";
import { bookFormat, rating } from "@booktrakd/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { recordActivity, removeActivitiesFor, syncShelfActivity } from "../lib/activity";
import { queryCards } from "../lib/cards";
import { applyShelfPatch, getShelf, refreshWorkStats, saveShelf } from "../lib/shelf";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { userIdByUsername } from "./users";

type Row = Record<string, unknown>;

export const reviewColumns = sql`
  e.id, e.work_id, e.rating, e.is_liked, e.is_reread, e.is_dnf, e.review_text,
  e.contains_spoilers, e.finished_on, e.started_on, e.format, e.created_at,
  e.like_count, e.comment_count,
  u.username, u.display_username, u.name as user_name, u.image as user_image`;

export function toReview(r: Row) {
  return {
    id: Number(r.id),
    workId: Number(r.work_id),
    rating: r.rating == null ? null : Number(r.rating),
    liked: Boolean(r.is_liked),
    reread: Boolean(r.is_reread),
    dnf: Boolean(r.is_dnf),
    text: (r.review_text as string | null) ?? null,
    spoilers: Boolean(r.contains_spoilers),
    finishedOn: r.finished_on ? String(r.finished_on).slice(0, 10) : null,
    startedOn: r.started_on ? String(r.started_on).slice(0, 10) : null,
    format: (r.format as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    likeCount: Number(r.like_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
    user: {
      username: r.username as string,
      displayName:
        (r.user_name as string) || (r.display_username as string) || (r.username as string),
      image: (r.user_image as string | null) ?? null,
    },
  };
}

export type Review = ReturnType<typeof toReview>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const entryInput = z.object({
  finishedOn: isoDate.nullable().default(null),
  startedOn: isoDate.nullable().default(null),
  rating: rating.nullable().default(null),
  liked: z.boolean().default(false),
  reread: z.boolean().default(false),
  dnf: z.boolean().default(false),
  review: z.string().trim().max(20_000).nullable().default(null),
  spoilers: z.boolean().default(false),
  format: bookFormat.nullable().default(null),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
});

async function ownedEntry(db: Parameters<typeof refreshWorkStats>[0], id: number, userId: string) {
  const [row] = rowsOf<Row>(await db.execute(sql`select * from entries where id = ${id}`));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.user_id !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  return row;
}

export const entriesRouter = router({
  create: protectedProcedure
    .input(entryInput.extend({ workId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const review = input.review || null;
      const [entry] = rowsOf<{ id: unknown }>(
        await ctx.db.execute(sql`
          insert into entries (user_id, work_id, format, started_on, finished_on, rating, is_liked,
                               is_reread, is_dnf, review_text, contains_spoilers)
          values (${ctx.user.id}, ${input.workId}, ${input.format}, ${input.startedOn},
                  ${input.finishedOn}, ${input.rating}, ${input.liked}, ${input.reread},
                  ${input.dnf}, ${review}, ${review ? input.spoilers : false})
          returning id
        `),
      );
      const entryId = Number(entry?.id);
      for (const tag of new Set(input.tags)) {
        await ctx.db.execute(
          sql`insert into entry_tags (entry_id, tag) values (${entryId}, ${tag}) on conflict do nothing`,
        );
      }

      // A DNF log doesn't mark the book read; a finished one does (and carries its rating).
      const current = await getShelf(ctx.db, ctx.user.id, input.workId);
      const next = applyShelfPatch(
        current,
        input.dnf
          ? { dnf: true }
          : {
              read: true,
              ...(input.rating != null && { rating: input.rating }),
              ...(input.liked && { liked: true }),
            },
      );
      await saveShelf(ctx.db, ctx.user.id, input.workId, next);

      // The entry stands in for the shelf change, so no separate "read"/"rated" activity.
      await syncShelfActivity(ctx.db, ctx.user.id, input.workId, current, next, {
        removalsOnly: true,
      });
      await recordActivity(
        ctx.db,
        ctx.user.id,
        review ? "reviewed" : "logged",
        { type: "entry", id: entryId },
        input.workId,
      );
      return { id: entryId, shelf: next };
    }),

  update: protectedProcedure
    .input(entryInput.extend({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ownedEntry(ctx.db, input.id, ctx.user.id);
      const review = input.review || null;
      await ctx.db.execute(sql`
        update entries set format = ${input.format}, started_on = ${input.startedOn},
          finished_on = ${input.finishedOn}, rating = ${input.rating}, is_liked = ${input.liked},
          is_reread = ${input.reread}, is_dnf = ${input.dnf}, review_text = ${review},
          contains_spoilers = ${review ? input.spoilers : false}, updated_at = now()
        where id = ${input.id}
      `);
      await ctx.db.execute(sql`delete from entry_tags where entry_id = ${input.id}`);
      for (const tag of new Set(input.tags)) {
        await ctx.db.execute(
          sql`insert into entry_tags (entry_id, tag) values (${input.id}, ${tag}) on conflict do nothing`,
        );
      }
      // Like create: a finished log carries its rating and like onto the book (saving also
      // refreshes the book's stats, e.g. its review count).
      const workId = Number(existing.work_id);
      const current = await getShelf(ctx.db, ctx.user.id, workId);
      const next = applyShelfPatch(
        current,
        input.dnf
          ? {}
          : {
              ...(input.rating != null && { rating: input.rating }),
              ...(input.liked && { liked: true }),
            },
      );
      await saveShelf(ctx.db, ctx.user.id, workId, next);
      await syncShelfActivity(ctx.db, ctx.user.id, workId, current, next, { removalsOnly: true });
      // Adding or removing the review text turns a "logged" activity into "reviewed" or back.
      await ctx.db.execute(sql`
        update activities set verb = ${review ? "reviewed" : "logged"}
        where object_type = 'entry' and object_id = ${String(input.id)}
          and verb in ('logged', 'reviewed')
      `);
      return { id: input.id, shelf: next };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ownedEntry(ctx.db, input.id, ctx.user.id);
      await ctx.db.execute(sql`delete from entries where id = ${input.id}`);
      await removeActivitiesFor(ctx.db, { type: "entry", id: input.id });
      await refreshWorkStats(ctx.db, Number(existing.work_id));
      return { ok: true };
    }),

  /** One entry with its book, for the review page. */
  get: publicProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const [entry] = await queryCards(
      ctx.db,
      sql`join entries e on e.work_id = w.id join users u on u.id = e.user_id
          where e.id = ${input.id}`,
      reviewColumns,
    );
    if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
    const tags = rowsOf<{ tag: string }>(
      await ctx.db.execute(
        sql`select tag from entry_tags where entry_id = ${input.id} order by tag`,
      ),
    ).map((t) => t.tag);
    const { row, ...book } = entry;
    return { ...toReview(row), book, tags };
  }),

  /** A user's diary, newest first. */
  diary: publicProcedure
    .input(z.object({ username: z.string(), offset: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const userId = await userIdByUsername(ctx.db, input.username);
      const limit = 50;
      const rows = await queryCards(
        ctx.db,
        sql`join entries e on e.work_id = w.id join users u on u.id = e.user_id
            where e.user_id = ${userId}
            order by coalesce(e.finished_on, e.created_at::date) desc, e.created_at desc
            limit ${limit + 1} offset ${input.offset}`,
        reviewColumns,
      );
      return {
        entries: rows.slice(0, limit).map(({ row, ...book }) => ({ ...toReview(row), book })),
        nextOffset: rows.length > limit ? input.offset + limit : null,
      };
    }),

  /** Reviews for a book or by a user. */
  reviews: publicProcedure
    .input(
      z.object({
        workId: z.number().int().optional(),
        username: z.string().optional(),
        sort: z.enum(["popular", "recent"]).default("popular"),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = 30;
      const userId = input.username ? await userIdByUsername(ctx.db, input.username) : null;
      const filters = [sql`e.review_text is not null`];
      if (input.workId) filters.push(sql`e.work_id = ${input.workId}`);
      if (userId) filters.push(sql`e.user_id = ${userId}`);
      const order =
        input.sort === "popular"
          ? sql`e.like_count desc, e.created_at desc`
          : sql`e.created_at desc`;
      const rows = await queryCards(
        ctx.db,
        sql`join entries e on e.work_id = w.id join users u on u.id = e.user_id
            where ${sql.join(filters, sql` and `)}
            order by ${order} limit ${limit + 1} offset ${input.offset}`,
        reviewColumns,
      );
      return {
        reviews: rows.slice(0, limit).map(({ row, ...book }) => ({ ...toReview(row), book })),
        nextOffset: rows.length > limit ? input.offset + limit : null,
      };
    }),
});
