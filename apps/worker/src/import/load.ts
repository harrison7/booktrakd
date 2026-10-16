import { once } from "node:events";
import { createReadStream } from "node:fs";
import { compose, Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import type { Database } from "@booktrakd/db";
import type { Sql } from "postgres";
import { parseDumpLine } from "../catalog/openlibrary";
import { env } from "../env";
import { log } from "../log";
import { encodeCopyRow } from "./copy";
import { columnNames, resetStagingTable, type StagingRow, type StagingTable } from "./staging";

/** Opens a gzipped dump from a local path or an http(s) URL (streamed, never saved to disk). */
async function openGzip(source: string): Promise<Readable> {
  if (!/^https?:\/\//.test(source)) return createReadStream(source);
  const res = await fetch(source, { headers: { "User-Agent": env.olUserAgent } });
  if (!res.ok || !res.body) throw new Error(`Fetch failed: ${res.status} ${source}`);
  return Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
}

/** Streams lines from a .gz file or URL without loading it into memory. */
export async function* readGzipLines(source: string): AsyncGenerator<string> {
  const stream = compose(await openGzip(source), createGunzip());
  stream.setEncoding("utf8");
  let rest = "";
  for await (const chunk of stream as AsyncIterable<string>) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    yield* lines;
  }
  if (rest) yield rest;
}

/**
 * Parses a dump and bulk-loads the kept rows into its staging table via COPY.
 * `keep` optionally filters parsed rows (used by the sample import).
 */
export async function loadDump(
  client: Sql,
  db: Database,
  table: StagingTable,
  source: string,
  keep?: (row: StagingRow) => boolean,
) {
  await resetStagingTable(db, table);
  const copy = await client
    .unsafe(`copy staging.${table} (${columnNames(table).join(", ")}) from stdin`)
    .writable();

  let read = 0;
  let kept = 0;
  for await (const line of readGzipLines(source)) {
    read++;
    const row = parseDumpLine(table, line);
    if (row && (!keep || keep(row))) {
      kept++;
      if (!copy.write(encodeCopyRow(row))) await once(copy, "drain");
    }
    if (read % 1_000_000 === 0)
      log(`${table}: read ${read.toLocaleString()}, kept ${kept.toLocaleString()}`);
  }
  copy.end();
  await finished(copy);
  log(`${table}: loaded ${kept.toLocaleString()} of ${read.toLocaleString()} lines`);
}
