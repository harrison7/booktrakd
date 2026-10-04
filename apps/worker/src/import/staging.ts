// Staging tables hold filtered, normalized Open Library rows before they are merged into
// the real catalog. They live in their own schema and are UNLOGGED (fast, disposable).
import { type Database, sql } from "@booktrakd/db";

export const STAGING_TABLES = {
  authors: [
    ["ol_key", "text"],
    ["name", "text"],
    ["bio", "text"],
    ["birth_date", "text"],
    ["death_date", "text"],
    ["photo_id", "integer"],
    ["slug_base", "text"],
  ],
  works: [
    ["ol_key", "text"],
    ["title", "text"],
    ["subtitle", "text"],
    ["match_title", "text"],
    ["slug_base", "text"],
    ["description", "text"],
    ["first_publish_year", "smallint"],
    ["cover_id", "integer"],
    ["subjects", "text[]"],
    ["genres", "text[]"],
    ["author_keys", "text[]"],
  ],
  editions: [
    ["ol_key", "text"],
    ["work_key", "text"],
    ["title", "text"],
    ["isbn10", "text"],
    ["isbn13", "text"],
    ["publisher", "text"],
    ["publish_date", "text"],
    ["publish_year", "smallint"],
    ["format", "text"],
    ["pages", "integer"],
    ["language", "text"],
    ["cover_id", "integer"],
  ],
  ratings: [
    ["work_key", "text"],
    ["rating", "smallint"],
  ],
  reading_log: [
    ["work_key", "text"],
    ["shelf", "text"],
  ],
} as const;

export type StagingTable = keyof typeof STAGING_TABLES;
export type StagingValue = string | number | string[] | null;
export type StagingRow = StagingValue[];

export const STAGING_TABLE_NAMES = Object.keys(STAGING_TABLES) as StagingTable[];

/** Postgres array literal, e.g. ["a", "b\"c"] → {"a","b\"c"} */
export const arrayLiteral = (items: string[]) =>
  `{${items.map((i) => `"${i.replace(/\0/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

export function columnNames(table: StagingTable): string[] {
  return STAGING_TABLES[table].map(([name]) => name);
}

const createTableSql = (table: StagingTable, ifNotExists: boolean) =>
  `create unlogged table ${ifNotExists ? "if not exists " : ""}staging.${table} (${STAGING_TABLES[
    table
  ]
    .map(([name, type]) => `${name} ${type}`)
    .join(", ")})`;

/** Drops and recreates one staging table (so a single dump can be reloaded). */
export async function resetStagingTable(db: Database, table: StagingTable) {
  await db.execute(sql.raw("create schema if not exists staging"));
  await db.execute(sql.raw(`drop table if exists staging.${table} cascade`));
  await db.execute(sql.raw(createTableSql(table, false)));
}

/** Creates any staging tables that don't exist yet (e.g. a dump that was skipped). */
export async function ensureStagingTables(db: Database) {
  await db.execute(sql.raw("create schema if not exists staging"));
  for (const table of STAGING_TABLE_NAMES) await db.execute(sql.raw(createTableSql(table, true)));
}

/** Plain INSERT-based writer, used in tests (production loads use COPY; see load.ts). */
export async function insertStagingRows(db: Database, table: StagingTable, rows: StagingRow[]) {
  if (rows.length === 0) return;
  const types = STAGING_TABLES[table].map(([, type]) => type);
  const values = rows.map(
    (row) =>
      sql`(${sql.join(
        row.map((v, i) => {
          // Drizzle would expand a JS array into a parameter list, so send a literal instead.
          const param = Array.isArray(v) ? arrayLiteral(v) : v;
          return sql`${param}::${sql.raw(types[i] ?? "text")}`;
        }),
        sql`, `,
      )})`,
  );
  await db.execute(
    sql`insert into ${sql.raw(`staging.${table}`)} (${sql.raw(columnNames(table).join(", "))}) values ${sql.join(values, sql`, `)}`,
  );
}
