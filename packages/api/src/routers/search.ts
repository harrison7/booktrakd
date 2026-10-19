import { rowsOf, sql } from "@booktrakd/db";
import { z } from "zod";
import type { BookCard } from "../lib/cards";
import { queryCards } from "../lib/cards";
import { publicProcedure, router } from "../trpc";

interface WorkHit {
  id: number;
  slug: string;
  title: string;
  authors: string[];
  year: number | null;
  cover_id: number | null;
  cover_key: string | null;
  cover_color: string | null;
}

export const searchRouter = router({
  books: publicProcedure
    .input(z.object({ q: z.string().trim().max(200), limit: z.number().int().max(50).default(20) }))
    .query(async ({ ctx, input }): Promise<BookCard[]> => {
      if (!input.q) return [];
      if (ctx.search) {
        const res = await ctx.search.index<WorkHit>("works").search(input.q, {
          limit: input.limit,
          attributesToRetrieve: [
            "id",
            "slug",
            "title",
            "authors",
            "year",
            "cover_id",
            "cover_key",
            "cover_color",
          ],
        });
        return res.hits.map((h) => ({
          id: h.id,
          slug: h.slug,
          title: h.title,
          year: h.year,
          authors: h.authors.join(", "),
          cover: h.cover_id ? { id: h.cover_id, key: h.cover_key, color: h.cover_color } : null,
        }));
      }
      // Fallback without Meilisearch: simple title match, most popular first.
      const cards = await queryCards(
        ctx.db,
        sql`where w.merged_into_id is null and w.title ilike ${`%${input.q}%`}
            order by w.popularity_score desc limit ${input.limit}`,
      );
      return cards.map(({ row: _row, ...card }) => card);
    }),

  authors: publicProcedure
    .input(z.object({ q: z.string().trim().max(200) }))
    .query(async ({ ctx, input }) => {
      if (input.q.length < 2) return [];
      const rows = rowsOf<{ name: string; slug: string; works: unknown }>(
        await ctx.db.execute(sql`
          select a.name, a.slug, count(c.work_id) as works
          from authors a join work_contributors c on c.author_id = a.id
          where a.merged_into_id is null and a.name ilike ${`%${input.q}%`}
          group by a.id order by count(c.work_id) desc limit 8
        `),
      );
      return rows.map((r) => ({ name: r.name, slug: r.slug, works: Number(r.works) }));
    }),

  members: publicProcedure
    .input(z.object({ q: z.string().trim().max(60) }))
    .query(async ({ ctx, input }) => {
      if (input.q.length < 2) return [];
      return rowsOf<{ username: string; name: string; image: string | null }>(
        await ctx.db.execute(sql`
          select username, name, image from users
          where username ilike ${`${input.q.toLowerCase()}%`} or name ilike ${`%${input.q}%`}
          order by username limit 8
        `),
      );
    }),
});
