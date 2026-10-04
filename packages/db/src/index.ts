import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Re-exported so every package uses this single copy of drizzle-orm.
export { and, desc, eq, inArray, or, sql } from "drizzle-orm";
export { GENRES, type GenreSlug } from "./genres";
export { seedGenres } from "./seed-genres";
export { schema };

/** Any Drizzle Postgres database using our schema (postgres-js in prod, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(
  url: string,
  options: postgres.Options<Record<string, postgres.PostgresType>> = {},
) {
  const client = postgres(url, { max: 10, ...options });
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Normalizes `db.execute()` results, which differ between drivers. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}
