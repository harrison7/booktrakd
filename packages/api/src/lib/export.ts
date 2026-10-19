// CSV export of a member's data: their library (one row per book) and diary.
import { type Database, rowsOf, sql } from "@booktrakd/db";
import Papa from "papaparse";

const stars = (rating: unknown) => (rating == null ? "" : String(Number(rating) / 2));
const date = (value: unknown) => (value ? String(value).slice(0, 10) : "");

export async function exportLibraryCsv(db: Database, userId: string): Promise<string> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select w.title, w.first_published_year, w.slug,
        (select string_agg(a.name, ', ' order by c.position) from work_contributors c
         join authors a on a.id = c.author_id where c.work_id = w.id and c.role = 'author') as authors,
        (select e.isbn13 from editions e where e.work_id = w.id and e.isbn13 is not null
         order by e.publish_year desc nulls last limit 1) as isbn13,
        uw.is_read, uw.rating, uw.is_liked, uw.on_reading_list, uw.is_currently_reading,
        uw.is_dnf, uw.updated_at
      from user_works uw join works w on w.id = uw.work_id
      where uw.user_id = ${userId}
      order by uw.updated_at desc
    `),
  );
  return Papa.unparse(
    rows.map((r) => ({
      Title: r.title,
      Authors: r.authors ?? "",
      Year: r.first_published_year ?? "",
      ISBN13: r.isbn13 ?? "",
      Read: r.is_read ? "yes" : "",
      Rating: stars(r.rating),
      Liked: r.is_liked ? "yes" : "",
      "Reading List": r.on_reading_list ? "yes" : "",
      "Currently Reading": r.is_currently_reading ? "yes" : "",
      "Did Not Finish": r.is_dnf ? "yes" : "",
      URL: `/book/${r.slug}`,
      Updated: date(new Date(r.updated_at as string).toISOString()),
    })),
  );
}

export async function exportDiaryCsv(db: Database, userId: string): Promise<string> {
  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      select e.*, w.title, w.first_published_year, w.slug,
        (select string_agg(t.tag, ', ' order by t.tag) from entry_tags t where t.entry_id = e.id) as tags
      from entries e join works w on w.id = e.work_id
      where e.user_id = ${userId}
      order by e.finished_on desc nulls last, e.created_at desc
    `),
  );
  return Papa.unparse(
    rows.map((r) => ({
      Title: r.title,
      Year: r.first_published_year ?? "",
      "Date Read": date(r.finished_on),
      "Date Started": date(r.started_on),
      Rating: stars(r.rating),
      Liked: r.is_liked ? "yes" : "",
      Reread: r.is_reread ? "yes" : "",
      "Did Not Finish": r.is_dnf ? "yes" : "",
      Format: r.format ?? "",
      Review: r.review_text ?? "",
      Spoilers: r.contains_spoilers ? "yes" : "",
      Tags: r.tags ?? "",
      URL: `/book/${r.slug}`,
    })),
  );
}
