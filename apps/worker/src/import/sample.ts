// Development import: only the N most popular works (by Open Library ratings and reading
// logs) plus their editions and authors. Streams dumps straight from Open Library (or uses
// already-downloaded files), so the multi-GB dumps never need to fit on disk.
import { existsSync } from "node:fs";
import type { Database } from "@booktrakd/db";
import type { Sql } from "postgres";
import { dumpUrl, parseDumpLine } from "../catalog/openlibrary";
import { log, timed } from "../log";
import { dumpPath } from "./download";
import { loadDump, readGzipLines } from "./load";
import type { StagingTable } from "./staging";

/** Same weights as the popularity score in build.ts. */
const WEIGHTS = { read: 1, reading: 2, want: 0.5, rating: 2 } as const;

/** Sums activity per work key from ratings and reading-log dump lines. */
export async function scoreWorks(
  ratings: AsyncIterable<string>,
  readingLog: AsyncIterable<string>,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const add = (key: string, weight: number) => scores.set(key, (scores.get(key) ?? 0) + weight);
  for await (const line of ratings) {
    const row = parseDumpLine("ratings", line);
    if (row) add(row[0] as string, WEIGHTS.rating);
  }
  for await (const line of readingLog) {
    const row = parseDumpLine("reading_log", line);
    if (row) add(row[0] as string, WEIGHTS[row[1] as "read" | "reading" | "want"]);
  }
  return scores;
}

export function topKeys(scores: Map<string, number>, n: number): Set<string> {
  return new Set(
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([key]) => key),
  );
}

/** Prefers a downloaded dump file; otherwise streams from Open Library. */
const source = (table: StagingTable) =>
  existsSync(dumpPath(table)) ? dumpPath(table) : dumpUrl(table);

export async function loadSample(client: Sql, db: Database, top: number) {
  const scores = await timed("Scoring works by reader activity", () =>
    scoreWorks(readGzipLines(source("ratings")), readGzipLines(source("reading_log"))),
  );
  const keep = topKeys(scores, top);
  log(
    `Selected the ${keep.size.toLocaleString()} most popular of ${scores.size.toLocaleString()} works`,
  );

  const byWork = (row: unknown[]) => keep.has(row[0] as string);
  await timed("Loading ratings", () => loadDump(client, db, "ratings", source("ratings"), byWork));
  await timed("Loading reading log", () =>
    loadDump(client, db, "reading_log", source("reading_log"), byWork),
  );

  const authorKeys = new Set<string>();
  await timed("Loading works", () =>
    loadDump(client, db, "works", source("works"), (row) => {
      if (!keep.has(row[0] as string)) return false;
      for (const key of row[10] as string[]) authorKeys.add(key);
      return true;
    }),
  );
  await timed("Loading editions (largest dump)", () =>
    loadDump(client, db, "editions", source("editions"), (row) => keep.has(row[1] as string)),
  );
  await timed("Loading authors", () =>
    loadDump(client, db, "authors", source("authors"), (row) => authorKeys.has(row[0] as string)),
  );
}
