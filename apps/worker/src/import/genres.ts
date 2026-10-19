// Re-derives every work's genres from its stored subjects after the mapping rules change,
// without reloading the dumps. (Uses works.subjects, which keeps the first 25 subjects.)
// When librarians can edit genres, this must skip works with librarian edits.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { mapSubjectsToGenres } from "../catalog/genres";
import { log } from "../log";
import { arrayLiteral } from "./staging";

export async function regenerateGenres(db: Database, batchSize = 2000) {
  let afterId = 0;
  let total = 0;
  for (;;) {
    const rows = rowsOf<{ id: unknown; subjects: string[] | null }>(
      await db.execute(sql`
        select id, subjects from works
        where merged_into_id is null and id > ${afterId}
        order by id limit ${batchSize}
      `),
    );
    if (rows.length === 0) break;
    const ids = rows.map((r) => Number(r.id));
    const pairs = rows.flatMap((r) =>
      mapSubjectsToGenres(r.subjects ?? []).map((genre) => [Number(r.id), genre] as const),
    );
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from work_genres where work_id = any(${arrayLiteral(ids.map(String))}::bigint[])`,
      );
      if (pairs.length > 0) {
        await tx.execute(sql`
          insert into work_genres (work_id, genre_slug)
          select * from unnest(
            ${arrayLiteral(pairs.map(([id]) => String(id)))}::bigint[],
            ${arrayLiteral(pairs.map(([, g]) => g))}::text[]
          )
          on conflict do nothing
        `);
      }
    });
    total += rows.length;
    afterId = ids[ids.length - 1] ?? afterId;
  }
  log(`Re-derived genres for ${total.toLocaleString()} works`);
}
