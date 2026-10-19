// Goodreads / StoryGraph import: preview (parse + match, no writes), then commit in batches.
import { rowsOf, sql } from "@booktrakd/db";
import { bookFormat, rating } from "@booktrakd/validators";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { queryCards } from "../lib/cards";
import { LibraryCsvError, parseLibraryCsv } from "../lib/library-csv";
import { matchBooks } from "../lib/match-books";
import { applyShelfPatch, getShelf, type ShelfPatch, saveShelf } from "../lib/shelf";
import { arrayParam } from "../lib/sql-arrays";
import { protectedProcedure, router } from "../trpc";

const MAX_ROWS = 20_000;
const MAX_CSV_BYTES = 15 * 1024 * 1024;

const commitRow = z.object({
  workId: z.number().int(),
  rating: rating.nullable(),
  status: z.enum(["read", "to-read", "reading", "dnf"]).nullable(),
  dateRead: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  review: z.string().max(20_000).nullable(),
  spoilers: z.boolean(),
  reread: z.boolean(),
  format: bookFormat.nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
});

type Row = Record<string, unknown>;

export const importsRouter = router({
  /** Parses an export and matches each row to a book. Nothing is saved. */
  preview: protectedProcedure
    .input(z.object({ csv: z.string().max(MAX_CSV_BYTES) }))
    .mutation(async ({ ctx, input }) => {
      let parsed: ReturnType<typeof parseLibraryCsv>;
      try {
        parsed = parseLibraryCsv(input.csv);
      } catch (error) {
        if (error instanceof LibraryCsvError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
      if (parsed.rows.length > MAX_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Imports are limited to ${MAX_ROWS} books`,
        });
      }
      const workIds = await matchBooks(ctx.db, parsed.rows);
      const ids = [...new Set(workIds.filter((id): id is number => id != null))];
      const cards = ids.length
        ? await queryCards(ctx.db, sql`where w.id = any(${arrayParam(ids)}::bigint[])`)
        : [];
      const byId = new Map(cards.map(({ row: _row, ...card }) => [card.id, card]));
      return {
        source: parsed.source,
        rows: parsed.rows.map((row, i) => ({ ...row, match: byId.get(workIds[i] ?? -1) ?? null })),
      };
    }),

  /**
   * Applies a batch of matched rows. Call repeatedly with the same importId (null for the
   * first batch); `final` marks the import done. Safe to re-run: identical diary entries
   * aren't duplicated.
   */
  commit: protectedProcedure
    .input(
      z.object({
        importId: z.number().int().nullable(),
        source: z.enum(["goodreads", "storygraph"]),
        rows: z.array(commitRow).max(500),
        unmatched: z.number().int().min(0).default(0),
        final: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let importId = input.importId;
      if (importId == null) {
        const [created] = rowsOf<{ id: unknown }>(
          await ctx.db.execute(sql`
            insert into imports (user_id, source, status, stats)
            values (${ctx.user.id}, ${input.source}, 'running',
                    '{"books":0,"entries":0,"unmatched":0}'::jsonb)
            returning id
          `),
        );
        importId = Number(created?.id);
      } else {
        const [own] = rowsOf<Row>(
          await ctx.db.execute(
            sql`select user_id from imports where id = ${importId} and status = 'running'`,
          ),
        );
        if (own?.user_id !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      }

      let entries = 0;
      for (const row of input.rows) {
        const patch: ShelfPatch =
          row.status === "read"
            ? { read: true, ...(row.rating != null && { rating: row.rating }) }
            : row.status === "to-read"
              ? { readingList: true }
              : row.status === "reading"
                ? { currentlyReading: true }
                : row.status === "dnf"
                  ? { dnf: true }
                  : row.rating != null
                    ? { rating: row.rating }
                    : {};
        const current = await getShelf(ctx.db, ctx.user.id, row.workId);
        await saveShelf(ctx.db, ctx.user.id, row.workId, applyShelfPatch(current, patch));

        // Diary entries only for reads/DNFs with a date or a review (like Letterboxd's import).
        const finished = row.status === "read" || row.status === "dnf";
        if (finished && (row.dateRead || row.review)) {
          const [existing] = rowsOf<Row>(
            await ctx.db.execute(sql`
              select 1 from entries
              where user_id = ${ctx.user.id} and work_id = ${row.workId}
                and finished_on is not distinct from ${row.dateRead}::date
                and review_text is not distinct from ${row.review}
            `),
          );
          if (!existing) {
            const [entry] = rowsOf<{ id: unknown }>(
              await ctx.db.execute(sql`
                insert into entries (user_id, work_id, format, finished_on, rating, is_reread,
                                     is_dnf, review_text, contains_spoilers)
                values (${ctx.user.id}, ${row.workId}, ${row.format}, ${row.dateRead},
                        ${row.rating}, ${row.reread}, ${row.status === "dnf"}, ${row.review},
                        ${row.review ? row.spoilers : false})
                returning id
              `),
            );
            for (const tag of new Set(row.tags)) {
              await ctx.db.execute(sql`
                insert into entry_tags (entry_id, tag) values (${Number(entry?.id)}, ${tag})
                on conflict do nothing
              `);
            }
            entries++;
          }
        }
      }

      await ctx.db.execute(sql`
        update imports set
          stats = jsonb_build_object(
            'books', (stats->>'books')::int + ${input.rows.length},
            'entries', (stats->>'entries')::int + ${entries},
            'unmatched', (stats->>'unmatched')::int + ${input.unmatched}),
          status = case when ${input.final} then 'done'::import_status else status end,
          finished_at = case when ${input.final} then now() end
        where id = ${importId}
      `);
      return { importId, books: input.rows.length, entries };
    }),
});
