// Turns staging rows into the real catalog. Safe to re-run with newer dumps: existing
// works/editions/authors are never overwritten (so librarian edits survive); only new
// records are added and derived fields (popularity, edition counts) are refreshed.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { log, timed } from "../log";
import { dedupeWorks } from "./dedupe";
import { localizeTitles } from "./localize";
import { ensureStagingTables } from "./staging";

async function run(db: Database, statements: string[]) {
  for (const statement of statements) await db.execute(sql.raw(statement));
}

/** Indexes staging, aggregates popularity, and picks which works to keep. */
const PREPARE = [
  "create index if not exists stg_works_key on staging.works (ol_key)",
  "create index if not exists stg_editions_work on staging.editions (work_key)",
  "create index if not exists stg_authors_key on staging.authors (ol_key)",
  "create index if not exists stg_ratings_work on staging.ratings (work_key)",
  "create index if not exists stg_reading_log_work on staging.reading_log (work_key)",

  "drop table if exists staging.popularity",
  `create unlogged table staging.popularity as
   select work_key, sum(ratings)::int as ratings, sum(want)::int as want,
          sum(reading)::int as reading, sum(read)::int as read
   from (
     select work_key, count(*) as ratings, 0 as want, 0 as reading, 0 as read
     from staging.ratings group by work_key
     union all
     select work_key, 0, count(*) filter (where shelf = 'want'),
            count(*) filter (where shelf = 'reading'), count(*) filter (where shelf = 'read')
     from staging.reading_log group by work_key
   ) s
   group by work_key`,
  "create unique index on staging.popularity (work_key)",

  // A work is kept if it has a useful edition (ISBN or cover) or any reader activity.
  "drop table if exists staging.kept_works",
  `create unlogged table staging.kept_works as
   select w.* from staging.works w
   where exists (select 1 from staging.editions e where e.work_key = w.ol_key)
      or exists (select 1 from staging.popularity p where p.work_key = w.ol_key)`,
  "create index on staging.kept_works (ol_key)",

  "drop table if exists staging.work_authors",
  `create unlogged table staging.work_authors as
   select k.ol_key as work_key, a.author_key, (a.ord - 1)::smallint as position
   from staging.kept_works k, unnest(k.author_keys) with ordinality as a(author_key, ord)`,
  "create index on staging.work_authors (author_key)",
  "create index on staging.work_authors (work_key)",
];

/** Inserts new authors, works, contributors, genres and editions. */
const INSERT = [
  `insert into authors (name, bio, birth_date, death_date, ol_photo_id, ol_author_id)
   select a.name, a.bio, a.birth_date, a.death_date, a.photo_id, a.ol_key
   from staging.authors a
   where a.ol_key in (select author_key from staging.work_authors)
   on conflict (ol_author_id) do nothing`,

  `insert into works (title, subtitle, match_title, description, first_published_year, subjects, ol_work_id)
   select title, subtitle, match_title, description, first_publish_year, subjects, ol_key
   from staging.kept_works
   on conflict (ol_work_id) do nothing`,

  // Only for works that have no contributors yet, so librarian corrections are kept.
  `insert into work_contributors (work_id, author_id, role, position)
   select w.id, a.id, 'author', min(wa.position)
   from staging.work_authors wa
   join works w on w.ol_work_id = wa.work_key
   join authors a on a.ol_author_id = wa.author_key
   where w.merged_into_id is null
     and not exists (select 1 from work_contributors c where c.work_id = w.id)
   group by w.id, a.id
   on conflict do nothing`,

  `insert into work_genres (work_id, genre_slug)
   select w.id, g.slug
   from staging.kept_works k
   join works w on w.ol_work_id = k.ol_key
   cross join unnest(k.genres) as kg(slug)
   join genres g on g.slug = kg.slug
   where w.merged_into_id is null
     and not exists (select 1 from work_genres x where x.work_id = w.id)
   on conflict do nothing`,

  // Editions of a work that was merged away attach to the surviving work.
  `insert into editions (work_id, title, isbn10, isbn13, publisher, publish_date, publish_year,
                         format, page_count, language, ol_cover_id, ol_edition_id)
   select coalesce(w.merged_into_id, w.id), coalesce(e.title, w.title), e.isbn10, e.isbn13,
          e.publisher, e.publish_date, e.publish_year, e.format::book_format, e.pages,
          e.language, e.cover_id, e.ol_key
   from staging.editions e
   join works w on w.ol_work_id = e.work_key
   on conflict (ol_edition_id) do nothing`,
];

/** Popularity from Open Library reading logs and ratings (log-scaled). */
const POPULARITY = [
  `update works w set popularity_score = s.score
   from (
     select coalesce(w2.merged_into_id, w2.id) as work_id,
            ln(1 + sum(p.read + 2 * p.reading + 0.5 * p.want + 2 * p.ratings))::real as score
     from staging.popularity p
     join works w2 on w2.ol_work_id = p.work_key
     group by 1
   ) s
   where s.work_id = w.id and w.popularity_score is distinct from s.score`,
];

/**
 * Edition-derived fields. Existing values win, except the edition count and the first
 * published year: Open Library's work-level year is often a later reprint (e.g. Pride and
 * Prejudice as 1853), so the earliest edition year wins when it is earlier.
 */
const AGGREGATES = [
  `update works w set
     edition_count = s.edition_count,
     page_count = coalesce(w.page_count, s.page_count),
     language = coalesce(w.language, s.language),
     first_published_year = least(w.first_published_year, s.first_year)
   from (
     select work_id,
            count(*)::int as edition_count,
            round(percentile_cont(0.5) within group (order by page_count)
                  filter (where page_count between 10 and 5000))::int as page_count,
            mode() within group (order by language) filter (where language is not null) as language,
            min(publish_year) filter (where publish_year >= 1450) as first_year -- printing press
     from editions
     group by work_id
   ) s
   where s.work_id = w.id`,
];

/**
 * Primary cover: the work's own Open Library cover, else the newest edition cover in the
 * work's main language. Images are fetched later by the cover worker.
 */
const COVERS = [
  `insert into covers (work_id, source, source_id)
   select w.id, 'openlibrary', coalesce(k.cover_id, ec.cover_id)::text
   from works w
   left join staging.kept_works k on k.ol_key = w.ol_work_id
   left join lateral (
     select e.ol_cover_id as cover_id
     from editions e
     where e.work_id = w.id and e.ol_cover_id is not null
     order by (e.language is not distinct from w.language) desc, e.publish_year desc nulls last
     limit 1
   ) ec on true
   where w.merged_into_id is null
     and w.primary_cover_id is null
     and coalesce(k.cover_id, ec.cover_id) is not null
   on conflict (source, source_id) do nothing`,

  `update works w set primary_cover_id = c.id
   from covers c
   where c.work_id = w.id and w.primary_cover_id is null and w.merged_into_id is null`,
];

/**
 * Assigns URL slugs to rows that don't have one. The most popular claim the bare slug
 * ("dune"), others get "-2", "-3"…; anything still colliding falls back to "-<id>".
 */
function slugStatements(table: "works" | "authors", candidatesSql: string) {
  const candidates = `staging.${table}_slug_candidates`;
  const assign = (expr: string) =>
    `update ${table} t set slug = c.candidate
     from (
       select id, candidate, count(*) over (partition by candidate) as n
       from (select id, ${expr} as candidate from ${candidates}) x
     ) c
     where c.id = t.id and t.slug is null and c.n = 1
       and not exists (select 1 from ${table} o where o.slug = c.candidate)`;
  return [
    `drop table if exists ${candidates}`,
    `create unlogged table ${candidates} as ${candidatesSql}`,
    assign("case when rn = 1 then base else base || '-' || rn end"),
    assign("base || '-' || id"),
  ];
}

const SLUGS = [
  ...slugStatements(
    "works",
    `select w.id, k.slug_base as base,
            row_number() over (partition by k.slug_base order by w.popularity_score desc, w.id) as rn
     from works w
     join staging.kept_works k on k.ol_key = w.ol_work_id
     where w.slug is null and w.merged_into_id is null`,
  ),
  ...slugStatements(
    "authors",
    `select a.id, s.slug_base as base,
            row_number() over (partition by s.slug_base order by coalesce(wc.n, 0) desc, a.id) as rn
     from authors a
     join staging.authors s on s.ol_key = a.ol_author_id
     left join (select author_id, count(*) as n from work_contributors group by author_id) wc
       on wc.author_id = a.id
     where a.slug is null and a.merged_into_id is null`,
  ),
];

export class EmptyStagingError extends Error {
  constructor() {
    super(
      "The staging tables are empty, so there's nothing to build from. Run `pnpm cli import load` " +
        "(or `import sample`) first. Staging tables are UNLOGGED for speed, so Postgres clears " +
        "them after an unclean shutdown (e.g. Docker Desktop being stopped or the PC sleeping).",
    );
  }
}

export async function buildCatalog(db: Database) {
  await ensureStagingTables(db);
  const [staged] = rowsOf<{ works: unknown }>(
    await db.execute(sql`select exists (select 1 from staging.works) as works`),
  );
  if (!staged?.works) throw new EmptyStagingError();
  await timed("Preparing staging data", () => run(db, PREPARE));
  await timed("Inserting authors, works and editions", () => run(db, INSERT));
  await timed("Computing popularity", () => run(db, POPULARITY));
  await timed("Using English titles for works titled in another script", () => localizeTitles(db));
  const dedupe = await timed("Merging duplicate works", () => dedupeWorks(db));
  log(
    `Merged ${dedupe.merged} duplicate works; ${dedupe.reported} ambiguous groups sent to librarians`,
  );
  await timed("Recomputing popularity after merges", () => run(db, POPULARITY));
  await timed("Computing edition counts, page counts, languages", () => run(db, AGGREGATES));
  await timed("Choosing covers", () => run(db, COVERS));
  await timed("Assigning slugs", () => run(db, SLUGS));

  const [counts] = rowsOf<Record<string, number | string>>(
    await db.execute(sql`
      select
        (select count(*) from works where merged_into_id is null) as works,
        (select count(*) from editions) as editions,
        (select count(*) from authors) as authors,
        (select count(*) from covers) as covers,
        (select count(*) from works where merged_into_id is null and slug is null) as missing_slugs
    `),
  );
  log(`Catalog: ${JSON.stringify(counts)}`);
  return dedupe;
}
