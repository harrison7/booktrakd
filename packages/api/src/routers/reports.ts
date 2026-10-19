import { sql } from "@booktrakd/db";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const reportsRouter = router({
  /** "Report an issue" on a book or author page — goes to the librarian queue. */
  catalog: protectedProcedure
    .input(
      z.object({
        objectType: z.enum(["work", "author"]),
        objectId: z.number().int(),
        kind: z.enum([
          "wrong_cover",
          "duplicate",
          "wrong_author",
          "wrong_info",
          "offensive",
          "other",
        ]),
        details: z.string().trim().max(2000).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.execute(sql`
        insert into catalog_reports (reporter_id, object_type, object_id, kind, details)
        values (${ctx.user.id}, ${input.objectType}, ${input.objectId}, ${input.kind},
                ${JSON.stringify({ text: input.details })}::jsonb)
      `);
      return { ok: true };
    }),
});
