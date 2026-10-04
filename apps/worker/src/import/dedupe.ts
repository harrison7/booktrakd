// Finds works with the same normalized title and first author and merges them into the
// most popular one. Every merge is recorded in catalog_edits so a librarian can revert it.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { arrayLiteral } from "./staging";

/**
 * Titles shared by genuinely different books from the same author (e.g. several different
 * "Selected Poems"). Groups with these titles are reported, never auto-merged.
 */
export const GENERIC_TITLES = [
  "poems",
  "selected poems",
  "collected poems",
  "complete poems",
  "new poems",
  "poetry",
  "works",
  "complete works",
  "collected works",
  "selected works",
  "writings",
  "selections",
  "stories",
  "short stories",
  "collected stories",
  "selected stories",
  "collected short stories",
  "short fiction",
  "novels",
  "novel",
  "plays",
  "essays",
  "letters",
  "selected letters",
  "journals",
  "diary",
  "memoirs",
  "autobiography",
  "untitled",
  "book",
  "omnibus",
  "anthology",
];

const MIN_TITLE_LENGTH = 4;

export async function dedupeWorks(db: Database): Promise<{ merged: number; reported: number }> {
  const generic = arrayLiteral(GENERIC_TITLES);

  await db.execute(sql`drop table if exists staging.dedupe_candidates`);
  await db.execute(sql`
    create unlogged table staging.dedupe_candidates as
    select * from (
      select w.id, w.match_title, fa.author_id, w.popularity_score,
             count(*) over (partition by w.match_title, fa.author_id) as group_size
      from works w
      join (
        select distinct on (work_id) work_id, author_id
        from work_contributors
        where role = 'author'
        order by work_id, position
      ) fa on fa.work_id = w.id
      where w.merged_into_id is null
    ) x
    where group_size > 1
  `);

  // Canonical work = most popular, then most editions, then oldest id.
  await db.execute(sql`drop table if exists staging.dedupe_pairs`);
  await db.execute(sql`
    create unlogged table staging.dedupe_pairs as
    select id as dup_id, canonical_id, match_title from (
      select c.id, c.match_title,
             first_value(c.id) over (
               partition by c.match_title, c.author_id
               order by c.popularity_score desc, ec.n desc, c.id
             ) as canonical_id
      from staging.dedupe_candidates c
      left join lateral (select count(*) as n from editions e where e.work_id = c.id) ec on true
    ) x
    where id <> canonical_id
  `);

  // Ambiguous: generic/very short titles, or a duplicate that users have already logged
  // (moving user data is left to the librarian merge tool).
  await db.execute(sql`
    alter table staging.dedupe_pairs add column ambiguous boolean not null default false
  `);
  await db.execute(sql`
    update staging.dedupe_pairs p set ambiguous = true
    where p.match_title = any(${generic}::text[])
       or length(p.match_title) < ${MIN_TITLE_LENGTH}
       or exists (select 1 from user_works u where u.work_id = p.dup_id)
       or exists (select 1 from entries e where e.work_id = p.dup_id)
       or exists (select 1 from list_items l where l.work_id = p.dup_id)
       or exists (select 1 from favorites f where f.work_id = p.dup_id)
  `);

  const reported = rowsOf<{ id: unknown }>(
    await db.execute(sql`
      insert into catalog_reports (object_type, object_id, kind, details)
      select 'work', p.canonical_id, 'possible_duplicate',
             jsonb_build_object('workIds', jsonb_agg(p.dup_id order by p.dup_id), 'source', 'import-dedupe')
      from staging.dedupe_pairs p
      where p.ambiguous
        and not exists (
          select 1 from catalog_reports r
          where r.object_type = 'work' and r.object_id = p.canonical_id
            and r.kind = 'possible_duplicate' and r.status = 'open'
        )
      group by p.canonical_id
      returning id
    `),
  ).length;

  const merged = await db.transaction(async (tx) => {
    const merge = "staging.dedupe_pairs";
    // The surviving work inherits anything it is missing from its duplicates.
    await tx.execute(
      sql.raw(`
      update works w set
        description = coalesce(w.description, d.description),
        subtitle = coalesce(w.subtitle, d.subtitle),
        first_published_year = least(w.first_published_year, d.first_year),
        primary_cover_id = coalesce(w.primary_cover_id, d.cover_id)
      from (
        select p.canonical_id,
               (array_agg(dw.description) filter (where dw.description is not null))[1] as description,
               (array_agg(dw.subtitle) filter (where dw.subtitle is not null))[1] as subtitle,
               min(dw.first_published_year) as first_year,
               (array_agg(dw.primary_cover_id) filter (where dw.primary_cover_id is not null))[1] as cover_id
        from ${merge} p join works dw on dw.id = p.dup_id
        where not p.ambiguous
        group by p.canonical_id
      ) d
      where w.id = d.canonical_id
    `),
    );
    await tx.execute(
      sql.raw(`
      update editions e set work_id = p.canonical_id
      from ${merge} p where e.work_id = p.dup_id and not p.ambiguous
    `),
    );
    await tx.execute(
      sql.raw(`
      update covers c set work_id = p.canonical_id
      from ${merge} p where c.work_id = p.dup_id and not p.ambiguous
    `),
    );
    await tx.execute(
      sql.raw(`
      insert into work_genres (work_id, genre_slug)
      select p.canonical_id, g.genre_slug
      from work_genres g join ${merge} p on p.dup_id = g.work_id
      where not p.ambiguous
      on conflict do nothing
    `),
    );
    await tx.execute(
      sql.raw(`
      delete from work_genres g using ${merge} p where g.work_id = p.dup_id and not p.ambiguous
    `),
    );
    await tx.execute(
      sql.raw(`
      delete from work_contributors c using ${merge} p where c.work_id = p.dup_id and not p.ambiguous
    `),
    );
    await tx.execute(
      sql.raw(`
      update works w set merged_into_id = p.canonical_id, slug = null, primary_cover_id = null
      from ${merge} p where w.id = p.dup_id and not p.ambiguous
    `),
    );
    const edits = await tx.execute(
      sql.raw(`
      insert into catalog_edits (object_type, object_id, action, diff)
      select 'work', canonical_id, 'merge',
             jsonb_build_object('mergedWorkId', dup_id, 'source', 'import-dedupe')
      from ${merge} where not ambiguous
      returning id
    `),
    );
    return rowsOf(edits).length;
  });

  return { merged, reported };
}
