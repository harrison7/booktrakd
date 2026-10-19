import { sql } from "@booktrakd/db";
import { rating } from "@booktrakd/validators";
import { z } from "zod";
import { applyShelfPatch, getShelf, saveShelf } from "../lib/shelf";
import { protectedProcedure, router } from "../trpc";

export const shelfRouter = router({
  /** Toggle read / liked / rating / reading list / currently reading / DNF for a book. */
  update: protectedProcedure
    .input(
      z.object({
        workId: z.number().int(),
        patch: z
          .object({
            read: z.boolean(),
            liked: z.boolean(),
            rating: rating.nullable(),
            readingList: z.boolean(),
            currentlyReading: z.boolean(),
            dnf: z.boolean(),
          })
          .partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = await getShelf(ctx.db, ctx.user.id, input.workId);
      const next = applyShelfPatch(current, input.patch);
      await saveShelf(ctx.db, ctx.user.id, input.workId, next);

      const verb =
        input.patch.rating != null
          ? "rated"
          : input.patch.liked
            ? "liked_work"
            : input.patch.read
              ? "read"
              : input.patch.readingList
                ? "added_to_reading_list"
                : input.patch.currentlyReading
                  ? "started_reading"
                  : null;
      if (verb) {
        await ctx.db.execute(sql`
          insert into activities (actor_id, verb, object_type, object_id, work_id)
          values (${ctx.user.id}, ${verb}, 'work', ${String(input.workId)}, ${input.workId})
        `);
      }
      return next;
    }),
});
