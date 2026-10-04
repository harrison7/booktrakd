import { type Database, rowsOf, sql } from "@booktrakd/db";
import type { Meilisearch } from "meilisearch";
import { log } from "../log";

export const WORKS_INDEX = "works";

export interface WorkDocument {
  id: number;
  slug: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  series: string | null;
  isbns: string[];
  genres: string[];
  year: number | null;
  language: string | null;
  popularity: number;
  edition_count: number;
  cover_key: string | null;
  cover_color: string | null;
}

export async function configureWorksIndex(meili: Meilisearch) {
  await meili
    .index(WORKS_INDEX)
    .updateSettings({
      searchableAttributes: ["title", "subtitle", "authors", "series", "isbns"],
      filterableAttributes: ["genres", "year", "language"],
      sortableAttributes: ["popularity", "year"],
      // Text relevance first, then popularity breaks ties ("dune" → Herbert's Dune first).
      rankingRules: [
        "words",
        "typo",
        "proximity",
        "attribute",
        "sort",
        "exactness",
        "popularity:desc",
      ],
      typoTolerance: { disableOnAttributes: ["isbns"] },
    })
    .waitTask();
}

/** Loads search documents for live works with id > afterId (keyset pagination). */
export async function fetchWorkDocuments(
  db: Database,
  afterId: number,
  limit: number,
): Promise<WorkDocument[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select w.id, w.slug, w.title, w.subtitle, w.first_published_year as year, w.language,
             w.popularity_score as popularity, w.edition_count, s.name as series,
             cv.storage_key as cover_key, cv.dominant_color as cover_color,
             coalesce((
               select array_agg(a.name order by c.position)
               from work_contributors c join authors a on a.id = c.author_id
               where c.work_id = w.id and c.role = 'author'
             ), '{}') as authors,
             coalesce((select array_agg(g.genre_slug) from work_genres g where g.work_id = w.id), '{}') as genres,
             coalesce((
               select (array_agg(distinct e.isbn13))[1:50]
               from editions e where e.work_id = w.id and e.isbn13 is not null
             ), '{}') as isbns
      from works w
      left join series s on s.id = w.series_id
      left join covers cv on cv.id = w.primary_cover_id and cv.status = 'ready'
      where w.merged_into_id is null and w.slug is not null and w.id > ${afterId}
      order by w.id
      limit ${limit}
    `),
  );
  // Drivers return bigint/real columns as strings or numbers depending on type.
  return rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug as string,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? null,
    authors: r.authors as string[],
    series: (r.series as string | null) ?? null,
    isbns: r.isbns as string[],
    genres: r.genres as string[],
    year: r.year == null ? null : Number(r.year),
    language: (r.language as string | null) ?? null,
    popularity: Number(r.popularity),
    edition_count: Number(r.edition_count),
    cover_key: (r.cover_key as string | null) ?? null,
    cover_color: (r.cover_color as string | null) ?? null,
  }));
}

/** Full reindex of the catalog into Meilisearch. */
export async function indexWorks(db: Database, meili: Meilisearch, batchSize = 5000) {
  await configureWorksIndex(meili);
  const index = meili.index<WorkDocument>(WORKS_INDEX);

  let afterId = 0;
  let total = 0;
  let lastTask: ReturnType<typeof index.addDocuments> | undefined;
  for (;;) {
    const docs = await fetchWorkDocuments(db, afterId, batchSize);
    if (docs.length === 0) break;
    lastTask = index.addDocuments(docs, { primaryKey: "id" });
    await lastTask; // enqueued; Meilisearch indexes in the background
    total += docs.length;
    afterId = docs[docs.length - 1]?.id ?? afterId;
    if (total % 100_000 < batchSize) log(`Queued ${total.toLocaleString()} works for indexing`);
  }

  // Remove works that have since been merged away.
  const merged = rowsOf<{ id: unknown }>(
    await db.execute(sql`select id from works where merged_into_id is not null`),
  ).map((r) => Number(r.id));
  for (let i = 0; i < merged.length; i += 10_000) {
    await index.deleteDocuments(merged.slice(i, i + 10_000));
  }

  log("Waiting for Meilisearch to finish indexing…");
  await lastTask?.waitTask({ timeout: 6 * 60 * 60 * 1000 });
  log(`Indexed ${total.toLocaleString()} works`);
}
