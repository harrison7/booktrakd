// Fix-up for authors stored with a non-Latin display name (imported before displayAuthorName
// existed, or added on demand): fetches their alternate names from the Open Library API.
import { displayAuthorName, slugify } from "@booktrakd/catalog";
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { env } from "../env";
import { log } from "../log";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `recheck` also re-fetches authors renamed before (updated after import) — for when the
 * naming rules change. Don't use it once librarians edit author names: it would undo them.
 */
export async function fixAuthorNames(db: Database, { recheck = false } = {}) {
  const authors = rowsOf<{ id: unknown; name: string; ol_author_id: string }>(
    await db.execute(sql`
      select id, name, ol_author_id from authors
      where (name !~ '[A-Za-z]' or (${recheck} and updated_at > created_at))
        and ol_author_id is not null and merged_into_id is null
    `),
  );
  log(`Checking ${authors.length} authors`);
  let fixed = 0;
  for (const author of authors) {
    const res = await fetch(`https://openlibrary.org/authors/${author.ol_author_id}.json`, {
      headers: { "User-Agent": env.olUserAgent },
    });
    if (res.ok) {
      const json = (await res.json()) as { name?: string; alternate_names?: string[] };
      const name = displayAuthorName(json.name ?? author.name, json.alternate_names ?? []);
      if (name !== author.name && /\p{Script=Latin}/u.test(name)) {
        const id = Number(author.id);
        const base = slugify(name, "author");
        const [taken] = rowsOf(
          await db.execute(sql`select 1 from authors where slug = ${base} and id <> ${id}`),
        );
        await db.execute(sql`
          update authors set name = ${name}, slug = ${taken ? `${base}-${id}` : base},
                             updated_at = now()
          where id = ${id}
        `);
        fixed++;
      }
    }
    await sleep(1000); // be polite to the Open Library API
  }
  log(`Renamed ${fixed} of ${authors.length} authors`);
}
