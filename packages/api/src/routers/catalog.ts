import { rowsOf, sql } from "@booktrakd/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type BookCard, num, queryCards, toCover } from "../lib/cards";
import { getShelf, getShelves } from "../lib/shelf";
import { publicProcedure, router } from "../trpc";
import { reviewColumns, toReview } from "./entries";

type Row = Record<string, unknown>;

export const catalogRouter = router({
  /** Everything the book page needs. */
  work: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const [w] = rowsOf<Row>(
      await ctx.db.execute(sql`
        select w.*, cv.id as cover_id,
               case when cv.status = 'ready' then cv.storage_key end as cover_key,
               cv.dominant_color as cover_color, s.name as series_name, s.slug as series_slug,
               ws.histogram, ws.rating_count, ws.rating_avg, ws.read_count, ws.like_count,
               ws.review_count, ws.reading_list_count
        from works w
        left join covers cv on cv.id = w.primary_cover_id
        left join series s on s.id = w.series_id
        left join work_stats ws on ws.work_id = w.id
        where w.slug = ${input.slug} and w.merged_into_id is null
      `),
    );
    if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
    const id = Number(w.id);

    const [contributors, genres, reviews] = await Promise.all([
      ctx.db.execute(sql`
        select a.name, a.slug, c.role from work_contributors c
        join authors a on a.id = c.author_id
        where c.work_id = ${id} order by c.position, a.name
      `),
      ctx.db.execute(sql`
        select g.slug, g.name from work_genres wg join genres g on g.slug = wg.genre_slug
        where wg.work_id = ${id} order by g.position
      `),
      ctx.db.execute(sql`
        select ${reviewColumns} from entries e join users u on u.id = e.user_id
        where e.work_id = ${id} and e.review_text is not null
        order by e.like_count desc, e.created_at desc limit 6
      `),
    ]);

    return {
      id,
      slug: w.slug as string,
      title: w.title as string,
      subtitle: (w.subtitle as string | null) ?? null,
      description: (w.description as string | null) ?? null,
      year: num(w.first_published_year),
      pageCount: num(w.page_count),
      editionCount: Number(w.edition_count),
      language: (w.language as string | null) ?? null,
      cover: toCover(w),
      series: w.series_slug
        ? {
            slug: w.series_slug as string,
            name: w.series_name as string,
            position: num(w.series_position),
          }
        : null,
      contributors: rowsOf<{ name: string; slug: string; role: string }>(contributors),
      genres: rowsOf<{ slug: string; name: string }>(genres),
      stats: {
        histogram: ((w.histogram as number[] | null) ?? Array(10).fill(0)).map(Number),
        ratingCount: Number(w.rating_count ?? 0),
        ratingAvg: w.rating_avg == null ? null : Number(w.rating_avg),
        readCount: Number(w.read_count ?? 0),
        likeCount: Number(w.like_count ?? 0),
        reviewCount: Number(w.review_count ?? 0),
        readingListCount: Number(w.reading_list_count ?? 0),
      },
      reviews: rowsOf<Row>(reviews).map(toReview),
      shelf: ctx.user ? await getShelf(ctx.db, ctx.user.id, id) : null,
    };
  }),

  editions: publicProcedure
    .input(z.object({ workId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = rowsOf<Row>(
        await ctx.db.execute(sql`
          select id, title, isbn13, isbn10, publisher, publish_date, publish_year, format,
                 page_count, language, ol_cover_id
          from editions where work_id = ${input.workId}
          order by publish_year desc nulls last, id limit 200
        `),
      );
      return rows.map((r) => ({
        id: Number(r.id),
        title: r.title as string,
        isbn13: (r.isbn13 as string | null) ?? null,
        publisher: (r.publisher as string | null) ?? null,
        publishDate: (r.publish_date as string | null) ?? null,
        format: (r.format as string | null) ?? null,
        pageCount: num(r.page_count),
        language: (r.language as string | null) ?? null,
        olCoverId: num(r.ol_cover_id),
      }));
    }),

  author: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
    const [a] = rowsOf<Row>(
      await ctx.db.execute(
        sql`select * from authors where slug = ${input.slug} and merged_into_id is null`,
      ),
    );
    if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    const books = await queryCards(
      ctx.db,
      sql`join work_contributors c on c.work_id = w.id
          where c.author_id = ${Number(a.id)} and w.merged_into_id is null
          order by w.popularity_score desc limit 300`,
      sql`c.role`,
    );
    return {
      id: Number(a.id),
      name: a.name as string,
      bio: (a.bio as string | null) ?? null,
      birthDate: (a.birth_date as string | null) ?? null,
      deathDate: (a.death_date as string | null) ?? null,
      olPhotoId: num(a.ol_photo_id),
      books: books.map(({ row, ...card }) => ({ ...card, role: row.role as string })),
      shelves: ctx.user
        ? await getShelves(
            ctx.db,
            ctx.user.id,
            books.map((b) => b.id),
          )
        : {},
    };
  }),

  /** Most popular books, for the home page. */
  popular: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(60).default(24) }))
    .query(async ({ ctx, input }): Promise<BookCard[]> => {
      const cards = await queryCards(
        ctx.db,
        sql`where w.merged_into_id is null and w.primary_cover_id is not null
            order by w.popularity_score desc limit ${input.limit}`,
      );
      return cards.map(({ row: _row, ...card }) => card);
    }),
});
