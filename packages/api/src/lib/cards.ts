// Book "cards" — the cover + title + author + year shape used by every grid and list.
import { type Database, rowsOf, type SQL, sql } from "@booktrakd/db";

export interface Cover {
  id: number;
  /** Storage prefix when cached (`covers/123`); null until the worker has fetched it. */
  key: string | null;
  color: string | null;
}

export interface BookCard {
  id: number;
  slug: string;
  title: string;
  year: number | null;
  authors: string;
  cover: Cover | null;
}

/** Select list producing a BookCard from `works w` (join covers as `cv` with coverJoin). */
export const cardColumns = sql`
  w.id, w.slug, w.title, w.first_published_year as year,
  cv.id as cover_id,
  case when cv.status = 'ready' then cv.storage_key end as cover_key,
  cv.dominant_color as cover_color,
  coalesce((
    select string_agg(a.name, ', ' order by wc.position)
    from work_contributors wc join authors a on a.id = wc.author_id
    where wc.work_id = w.id and wc.role = 'author'
  ), '') as authors`;

export const coverJoin = sql`left join covers cv on cv.id = w.primary_cover_id`;

type Row = Record<string, unknown>;

export const num = (v: unknown) => (v == null ? null : Number(v));

export function toCover(row: Row, prefix = "cover"): Cover | null {
  const id = row[`${prefix}_id`];
  if (id == null) return null;
  return {
    id: Number(id),
    key: (row[`${prefix}_key`] as string | null) ?? null,
    color: (row[`${prefix}_color`] as string | null) ?? null,
  };
}

export function toCard(row: Row): BookCard {
  return {
    id: Number(row.id),
    slug: row.slug as string,
    title: row.title as string,
    year: num(row.year),
    authors: (row.authors as string) ?? "",
    cover: toCover(row),
  };
}

/** Runs `select <card columns>, <extra> from works w … <rest>` and maps rows to cards. */
export async function queryCards<Extra extends Row = Row>(
  db: Database,
  rest: SQL,
  extraColumns?: SQL,
): Promise<(BookCard & { row: Extra })[]> {
  const rows = rowsOf<Row>(
    await db.execute(sql`
      select ${cardColumns}${extraColumns ? sql`, ${extraColumns}` : sql``}
      from works w ${coverJoin}
      ${rest}
    `),
  );
  return rows.map((row) => ({ ...toCard(row), row: row as Extra }));
}
