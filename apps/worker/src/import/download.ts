import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { DUMP_FILES, dumpUrl } from "../catalog/openlibrary";
import { env } from "../env";
import { log } from "../log";
import type { StagingTable } from "./staging";

export const dumpPath = (table: StagingTable) => path.join(env.dataDir, DUMP_FILES[table]);

/** Downloads one Open Library dump (several GB for editions). Skips files already present. */
export async function downloadDump(table: StagingTable, { force = false } = {}) {
  const dest = dumpPath(table);
  if (!force && existsSync(dest)) {
    log(`${DUMP_FILES[table]} already downloaded (use --force to re-download)`);
    return dest;
  }
  await mkdir(env.dataDir, { recursive: true });

  const res = await fetch(dumpUrl(table), { headers: { "User-Agent": env.olUserAgent } });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${dumpUrl(table)}`);

  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let lastLogged = 0;
  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received - lastLogged > 256 * 1024 * 1024) {
        lastLogged = received;
        const pct = total ? ` (${((received / total) * 100).toFixed(0)}%)` : "";
        log(`${DUMP_FILES[table]}: ${(received / 1e9).toFixed(2)} GB${pct}`);
      }
      callback(null, chunk);
    },
  });

  const partial = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as ReadableStream<Uint8Array>),
    progress,
    createWriteStream(partial),
  );
  await rename(partial, dest);
  log(`Downloaded ${DUMP_FILES[table]} (${(received / 1e9).toFixed(2)} GB)`);
  return dest;
}
