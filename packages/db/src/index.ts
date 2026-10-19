import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Re-exported so every package uses this single copy of drizzle-orm.
export { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
export { GENRES, type GenreSlug } from "./genres";
export { COVER_QUEUE, type CoverJob } from "./jobs";
export { seedGenres } from "./seed-genres";
export { schema };

/** Any Drizzle Postgres database using our schema (postgres-js in prod, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(
  url: string,
  options: postgres.Options<Record<string, postgres.PostgresType>> = {},
) {
  // Notices ("table does not exist, skipping") are expected; don't print them.
  const client = postgres(url, { max: 10, onnotice: () => {}, ...options });
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Normalizes `db.execute()` results, which differ between drivers. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}
