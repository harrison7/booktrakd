import { once } from "node:events";
import { createReadStream } from "node:fs";
import { compose } from "node:stream";
import { finished } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import type { Database } from "@booktrakd/db";
import type { Sql } from "postgres";
import { parseDumpLine } from "../catalog/openlibrary";
import { log } from "../log";
import { encodeCopyRow } from "./copy";
import { columnNames, resetStagingTable, type StagingTable } from "./staging";

/** Streams lines from a .gz file without loading it into memory. */
export async function* readGzipLines(file: string): AsyncGenerator<string> {
  const stream = compose(createReadStream(file), createGunzip());
  stream.setEncoding("utf8");
  let rest = "";
  for await (const chunk of stream as AsyncIterable<string>) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    yield* lines;
  }
  if (rest) yield rest;
}

/** Parses a dump and bulk-loads the kept rows into its staging table via COPY. */
export async function loadDump(client: Sql, db: Database, table: StagingTable, file: string) {
  await resetStagingTable(db, table);
  const copy = await client
    .unsafe(`copy staging.${table} (${columnNames(table).join(", ")}) from stdin`)
    .writable();

  let read = 0;
  let kept = 0;
  for await (const line of readGzipLines(file)) {
    read++;
    const row = parseDumpLine(table, line);
    if (row) {
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
