// Usage (from the repo root):
//   pnpm cli import download [--only works,editions] [--force]
//   pnpm cli import load     [--only works,editions]
//   pnpm cli import build
//   pnpm cli import index
//   pnpm cli import all                 download → load → build → index
//   pnpm cli import sample [--top 50000] dev catalog: most popular works only, streamed
//   pnpm cli import genres              re-derive genres after changing the mapping rules
//   pnpm cli import author-names [--recheck]  fix authors stored under a non-Latin name (OL API)
//   pnpm cli covers prefetch [--top 50000]
//   pnpm cli covers process <coverId>   process one cover now (debugging)
//   pnpm cli worker                     run background jobs
import { parseArgs } from "node:util";
import { createDb } from "@booktrakd/db";
import { Meilisearch } from "meilisearch";
import { processCover } from "./covers/process";
import { COVER_QUEUE, type CoverJob, prefetchCovers, startBoss } from "./covers/queue";
import { createStorage } from "./covers/storage";
import { env } from "./env";
import { fixAuthorNames } from "./import/author-names";
import { buildCatalog } from "./import/build";
import { downloadDump, dumpPath } from "./import/download";
import { regenerateGenres } from "./import/genres";
import { loadDump } from "./import/load";
import { loadSample } from "./import/sample";
import { STAGING_TABLE_NAMES, type StagingTable } from "./import/staging";
import { log, timed } from "./log";
import { indexWorks, WORKS_INDEX } from "./search/index-works";

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    only: { type: "string" },
    force: { type: "boolean", default: false },
    recheck: { type: "boolean", default: false },
    top: { type: "string", default: "50000" },
  },
});

function selectedDumps(): StagingTable[] {
  if (!flags.only) return STAGING_TABLE_NAMES;
  const names = flags.only.split(",").map((s) => s.trim());
  const unknown = names.filter((n) => !(STAGING_TABLE_NAMES as string[]).includes(n));
  if (unknown.length) {
    throw new Error(
      `Unknown dump(s): ${unknown.join(", ")}. Valid: ${STAGING_TABLE_NAMES.join(", ")}`,
    );
  }
  return names as StagingTable[];
}

function meiliClient() {
  const config = env.meili;
  if (!config) throw new Error("MEILI_URL is not set (see .env.example)");
  return new Meilisearch(config);
}

async function withDb<T>(fn: (conn: ReturnType<typeof createDb>) => Promise<T>) {
  const conn = createDb(env.databaseUrl);
  try {
    return await fn(conn);
  } finally {
    await conn.client.end();
  }
}

async function importCommand(step: string | undefined) {
  const download = async () => {
    for (const table of selectedDumps()) {
      await timed(`Downloading ${table}`, () => downloadDump(table, { force: flags.force }));
    }
  };
  const load = () =>
    withDb(async ({ db, client }) => {
      for (const table of selectedDumps()) {
        await timed(`Loading ${table}`, () => loadDump(client, db, table, dumpPath(table)));
      }
    });
  const build = () => withDb(({ db }) => buildCatalog(db));
  const index = () => withDb(({ db }) => indexWorks(db, meiliClient()));

  switch (step) {
    case "download":
      return download();
    case "load":
      return load();
    case "build":
      return build();
    case "index":
      return index();
    case "all":
      await download();
      await load();
      await build();
      return index();
    case "author-names":
      await withDb(({ db }) => fixAuthorNames(db, { recheck: flags.recheck }));
      return index();
    case "genres":
      await withDb(({ db }) => regenerateGenres(db));
      return index();
    case "sample":
      await withDb(({ db, client }) => loadSample(client, db, Number(flags.top)));
      await build();
      return index();
    default:
      throw new Error(
        "Usage: pnpm cli import <download|load|build|index|all|sample|genres|author-names>",
      );
  }
}

async function coversCommand(step: string | undefined, arg: string | undefined) {
  if (step === "prefetch") {
    const top = Number(flags.top);
    return withDb(async ({ db }) => {
      const boss = await startBoss(env.databaseUrl);
      try {
        await prefetchCovers(db, boss, top);
      } finally {
        await boss.stop();
      }
    });
  }
  if (step === "process" && arg) {
    return withDb(async ({ db }) => {
      const result = await processCover(db, createStorage(), Number(arg), {
        userAgent: env.olUserAgent,
      });
      log(`Cover ${arg}: ${JSON.stringify(result)}`);
    });
  }
  throw new Error("Usage: pnpm cli covers <prefetch [--top N] | process <coverId>>");
}

async function workerCommand() {
  const { db, client } = createDb(env.databaseUrl);
  const storage = createStorage();
  const meili = env.meili ? new Meilisearch(env.meili) : null;
  const boss = await startBoss(env.databaseUrl);

  await boss.work<CoverJob>(COVER_QUEUE, { batchSize: 1, localConcurrency: 4 }, async ([job]) => {
    if (!job) return;
    const result = await processCover(db, storage, job.data.coverId, {
      userAgent: env.olUserAgent,
    });
    // Keep search results' covers in sync without a full reindex.
    if (result.status === "ready" && result.workId && meili) {
      await meili
        .index(WORKS_INDEX)
        .updateDocuments([
          { id: result.workId, cover_key: result.storageKey, cover_color: result.dominantColor },
        ]);
    }
  });
  log(`Worker running (queues: ${COVER_QUEUE}). Ctrl+C to stop.`);

  const shutdown = async () => {
    log("Shutting down…");
    await boss.stop();
    await client.end();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const [command, step, arg] = positionals;
try {
  if (command === "import") await importCommand(step);
  else if (command === "covers") await coversCommand(step, arg);
  else if (command === "worker") await workerCommand();
  else {
    console.log("Usage: pnpm cli <import|covers|worker> …  (see apps/worker/src/cli.ts)");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
