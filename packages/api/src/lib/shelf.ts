// A user's state for a book (read / liked / rating / reading list / currently reading / DNF)
// and the denormalized per-book counters that depend on it.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { EMPTY_SHELF, type ShelfState } from "./shelf-rules";

export {
  applyShelfPatch,
  EMPTY_SHELF,
  type ShelfPatch,
  type ShelfState,
} from "./shelf-rules";

type Row = Record<string, unknown>;

const toState = (row: Row | undefined): ShelfState =>
  row
    ? {
        read: Boolean(row.is_read),
        liked: Boolean(row.is_liked),
        rating: row.rating == null ? null : Number(row.rating),
        readingList: Boolean(row.on_reading_list),
        currentlyReading: Boolean(row.is_currently_reading),
        dnf: Boolean(row.is_dnf),
      }
    : { ...EMPTY_SHELF };

export async function getShelf(db: Database, userId: string, workId: number) {
  const [row] = rowsOf<Row>(
    await db.execute(
      sql`select * from user_works where user_id = ${userId} and work_id = ${workId}`,
    ),
  );
  return toState(row);
}

export async function getShelves(db: Database, userId: string, workIds: number[]) {
  const states: Record<number, ShelfState> = {};
  if (workIds.length === 0) return states;
  const rows = rowsOf<Row>(
    await db.execute(sql`
      select * from user_works
      where user_id = ${userId} and work_id in (${sql.join(
        workIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `),
  );
  for (const row of rows) states[Number(row.work_id)] = toState(row);
  return states;
}

/** Writes a full shelf state (after applyShelfPatch) and refreshes the book's counters. */
export async function saveShelf(db: Database, userId: string, workId: number, s: ShelfState) {
  await db.execute(sql`
    insert into user_works (user_id, work_id, is_read, is_liked, rating, on_reading_list,
                            reading_list_position, reading_list_added_at,
                            is_currently_reading, is_dnf)
    values (${userId}, ${workId}, ${s.read}, ${s.liked}, ${s.rating}, ${s.readingList},
            case when ${s.readingList} then (
              select coalesce(max(reading_list_position), 0) + 1
              from user_works where user_id = ${userId} and on_reading_list
            ) end,
            case when ${s.readingList} then now() end,
            ${s.currentlyReading}, ${s.dnf})
    on conflict (user_id, work_id) do update set
      is_read = excluded.is_read,
      is_liked = excluded.is_liked,
      rating = excluded.rating,
      is_currently_reading = excluded.is_currently_reading,
      is_dnf = excluded.is_dnf,
      on_reading_list = excluded.on_reading_list,
      -- Keep the existing position/date if the book was already on the list.
      reading_list_position = case
        when not excluded.on_reading_list then null
        when user_works.on_reading_list then user_works.reading_list_position
        else excluded.reading_list_position end,
      reading_list_added_at = case
        when not excluded.on_reading_list then null
        when user_works.on_reading_list then user_works.reading_list_added_at
        else excluded.reading_list_added_at end,
      updated_at = now()
  `);
  await refreshWorkStats(db, workId);
}

/** Recomputes one book's counters from user_works / entries. Cheap: one indexed book. */
export async function refreshWorkStats(db: Database, workId: number) {
  await db.execute(sql`
    insert into work_stats (work_id, histogram, rating_count, rating_avg, read_count,
                            like_count, review_count, reading_list_count, updated_at)
    select ${workId},
           array(
             select count(u.rating)::int
             from generate_series(1, 10) g
             left join user_works u on u.work_id = ${workId} and u.rating = g
             group by g order by g
           ),
           count(*) filter (where rating is not null)::int,
           avg(rating)::real,
           count(*) filter (where is_read)::int,
           count(*) filter (where is_liked)::int,
           (select count(*)::int from entries e
            where e.work_id = ${workId} and e.review_text is not null),
           count(*) filter (where on_reading_list)::int,
           now()
    from user_works where work_id = ${workId}
    on conflict (work_id) do update set
      histogram = excluded.histogram,
      rating_count = excluded.rating_count,
      rating_avg = excluded.rating_avg,
      read_count = excluded.read_count,
      like_count = excluded.like_count,
      review_count = excluded.review_count,
      reading_list_count = excluded.reading_list_count,
      updated_at = excluded.updated_at
  `);
}
