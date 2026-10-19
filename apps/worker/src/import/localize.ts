// Open Library sometimes titles a work in its original script (Russian, Japanese…) even when
// most of its editions are English ("Преступление и наказание" for Crime and Punishment).
// Readers here search and browse in English, so such works take their most common English
// edition title; the original is kept in original_title (and stays searchable).
//
// Runs before duplicate merging (an English-titled copy of the same book then merges in)
// and before slugs are assigned (so the English title produces the slug).
import { cleanTitle, matchTitle, slugify } from "@booktrakd/catalog";
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { log } from "../log";

/** Minimum English editions sharing a title before we trust it as the English title. */
const MIN_ENGLISH_EDITIONS = 2;

export async function localizeTitles(db: Database): Promise<number> {
  const rows = rowsOf<{ id: unknown; ol_work_id: string | null; english_title: string }>(
    await db.execute(sql`
      select w.id, w.ol_work_id, et.title as english_title
      from works w
      join lateral (
        select e.title from editions e
        where e.work_id = w.id and e.language = 'eng' and e.title ~ '[A-Za-z]'
        group by e.title
        having count(*) >= ${MIN_ENGLISH_EDITIONS}
        order by count(*) desc, e.title
        limit 1
      ) et on true
      where w.merged_into_id is null and w.original_title is null and w.slug is null
        and w.title !~ '[A-Za-z]'
    `),
  );
  for (const row of rows) {
    const title = cleanTitle(row.english_title);
    await db.execute(sql`
      update works set original_title = title, title = ${title}, match_title = ${matchTitle(title)},
                       updated_at = now()
      where id = ${Number(row.id)}
    `);
    // The slug step derives slugs from staging, so point it at the English title too.
    await db.execute(sql`
      update staging.kept_works set slug_base = ${slugify(title, "book")}
      where ol_key = ${row.ol_work_id}
    `);
  }
  log(`Gave ${rows.length.toLocaleString()} works their English edition title`);
  return rows.length;
}
