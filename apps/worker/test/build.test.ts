// End-to-end catalog build against an in-memory Postgres with the real migrations.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { createTestDb } from "@booktrakd/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDumpLine } from "../src/catalog/openlibrary";
import { buildCatalog, EmptyStagingError } from "../src/import/build";
import {
  insertStagingRows,
  resetStagingTable,
  type StagingRow,
  type StagingTable,
} from "../src/import/staging";
import { fetchWorkDocuments } from "../src/search/index-works";
import { AUTHORS, EDITIONS, RATINGS, READING_LOG, WORKS } from "./fixtures";

const DUMPS: Record<StagingTable, string[]> = {
  authors: AUTHORS,
  works: WORKS,
  editions: EDITIONS,
  ratings: RATINGS,
  reading_log: READING_LOG,
};

async function query<T = Record<string, unknown>>(db: Database, q: ReturnType<typeof sql>) {
  return rowsOf<T>(await db.execute(q));
}

async function workByOlId(db: Database, olId: string) {
  const [row] = await query(db, sql`select * from works where ol_work_id = ${olId}`);
  return row;
}

let db: Database;
let firstRun: { merged: number; reported: number };

beforeAll(async () => {
  ({ db } = await createTestDb());
  for (const [table, lines] of Object.entries(DUMPS) as [StagingTable, string[]][]) {
    await resetStagingTable(db, table);
    const rows = lines
      .map((l) => parseDumpLine(table, l))
      .filter((r): r is StagingRow => r !== null);
    await insertStagingRows(db, table, rows);
  }
  firstRun = await buildCatalog(db);
}, 60_000);

describe("buildCatalog", () => {
  it("refuses to build from empty staging tables", async () => {
    const { db: empty } = await createTestDb();
    await expect(buildCatalog(empty)).rejects.toBeInstanceOf(EmptyStagingError);
  }, 60_000);

  it("keeps works with useful editions or reader activity, drops the rest", async () => {
    const live = await query<{ ol_work_id: string }>(
      db,
      sql`select ol_work_id from works where merged_into_id is null order by ol_work_id`,
    );
    expect(live.map((r) => r.ol_work_id)).toEqual([
      "OL10W",
      "OL1W",
      "OL3W",
      "OL4W",
      "OL5W",
      "OL6W",
      "OL8W",
    ]);
    expect(await workByOlId(db, "OL7W")).toBeUndefined();
  });

  it("merges duplicate works into the most popular one", async () => {
    expect(firstRun.merged).toBe(2); // Dune's deluxe edition + Crime and Punishment
    const dune = await workByOlId(db, "OL1W");
    const deluxe = await workByOlId(db, "OL2W");
    expect(deluxe?.merged_into_id).toBe(dune?.id);
    expect(deluxe?.slug).toBeNull();

    // Both editions now belong to Dune, with derived fields from them.
    expect(dune?.edition_count).toBe(2);
    expect(dune?.page_count).toBe(535);
    expect(dune?.language).toBe("eng");
    expect(dune?.first_published_year).toBe(1965);

    const [edit] = await query(db, sql`select * from catalog_edits`);
    expect(edit).toMatchObject({ object_type: "work", action: "merge" });
  });

  it("uses the earliest edition year when Open Library's work year is later", async () => {
    expect((await workByOlId(db, "OL5W"))?.first_published_year).toBe(1818);
  });

  it("uses the English edition title for works titled in another script", async () => {
    const work = await workByOlId(db, "OL10W");
    expect(work).toMatchObject({
      title: "Crime and Punishment",
      original_title: "Преступление и наказание",
      match_title: "crime and punishment",
      slug: "crime-and-punishment",
      edition_count: 4,
    });
    expect((await workByOlId(db, "OL11W"))?.merged_into_id).toBe(work?.id);
  });

  it("reports ambiguous duplicates (generic titles) instead of merging them", async () => {
    expect(firstRun.reported).toBe(1);
    const poems = await query(
      db,
      sql`select merged_into_id from works where ol_work_id in ('OL3W', 'OL4W')`,
    );
    expect(poems.every((p) => p.merged_into_id === null)).toBe(true);
    const [report] = await query(db, sql`select * from catalog_reports`);
    expect(report).toMatchObject({ kind: "possible_duplicate", status: "open" });
  });

  it("gives the most popular work the bare slug", async () => {
    expect((await workByOlId(db, "OL1W"))?.slug).toBe("dune");
    expect((await workByOlId(db, "OL8W"))?.slug).toBe("dune-2");
    expect((await workByOlId(db, "OL5W"))?.slug).toBe("frankenstein-or-the-modern-prometheus");
    const authors = await query<{ slug: string }>(db, sql`select slug from authors order by slug`);
    expect(authors.map((a) => a.slug)).toEqual([
      "emily-dickinson",
      "frank-herbert",
      "mary-shelley",
    ]);
  });

  it("scores popularity from reading logs and ratings, including merged duplicates", async () => {
    const dune = await workByOlId(db, "OL1W");
    // 3 reads + 2×2 ratings + 0.5 (the merged duplicate's want-to-read)
    expect(Number(dune?.popularity_score)).toBeCloseTo(Math.log(1 + 7.5), 4);
    expect(Number((await workByOlId(db, "OL5W"))?.popularity_score)).toBe(0);
  });

  it("links authors and genres", async () => {
    const rows = await query<{ name: string; genre_slug: string }>(
      db,
      sql`select a.name, g.genre_slug
          from works w
          join work_contributors c on c.work_id = w.id
          join authors a on a.id = c.author_id
          join work_genres g on g.work_id = w.id
          where w.ol_work_id = 'OL1W'`,
    );
    expect(rows).toEqual([{ name: "Frank Herbert", genre_slug: "science-fiction" }]);
  });

  it("picks a primary cover from the work, falling back to an edition", async () => {
    const covers = await query<{ ol: string; source_id: string }>(
      db,
      sql`select w.ol_work_id as ol, c.source_id
          from works w join covers c on c.id = w.primary_cover_id
          order by w.ol_work_id`,
    );
    expect(covers).toEqual([
      { ol: "OL1W", source_id: "100" },
      { ol: "OL3W", source_id: "300" },
      { ol: "OL4W", source_id: "301" },
      { ol: "OL5W", source_id: "500" },
      { ol: "OL8W", source_id: "800" },
    ]);
  });

  it("produces search documents", async () => {
    const docs = await fetchWorkDocuments(db, 0, 100);
    const dune = docs.find((d) => d.slug === "dune");
    expect(dune).toMatchObject({
      title: "Dune",
      authors: ["Frank Herbert"],
      genres: ["science-fiction"],
      year: 1965,
      edition_count: 2,
    });
    expect(dune?.isbns.sort()).toEqual(["9780441013593", "9780441172719"]);
    expect(docs).toHaveLength(7);
  });

  it("is safe to re-run", async () => {
    const counts = () =>
      query(
        db,
        sql`select (select count(*) from works)::int as works,
                   (select count(*) from editions)::int as editions,
                   (select count(*) from authors)::int as authors,
                   (select count(*) from covers)::int as covers,
                   (select count(*) from work_genres)::int as genres,
                   (select count(*) from catalog_reports)::int as reports,
                   (select count(*) from catalog_edits)::int as edits`,
      );
    const before = await counts();
    const second = await buildCatalog(db);
    expect(second).toEqual({ merged: 0, reported: 0 });
    expect(await counts()).toEqual(before);
  }, 60_000);
});
