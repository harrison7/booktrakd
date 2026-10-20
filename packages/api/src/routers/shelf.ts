import { rating } from "@booktrakd/validators";
import { z } from "zod";
import { syncShelfActivity } from "../lib/activity";
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

      await syncShelfActivity(ctx.db, ctx.user.id, input.workId, current, next);
      return next;
    }),
});
