// Finds catalog works for imported rows: by ISBN first, then by title + author.
import { matchTitle, stripLatinDiacritics } from "@booktrakd/catalog";
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { arrayParam } from "./sql-arrays";

export interface MatchInput {
  title: string;
  authors: string[];
  isbn13: string | null;
}

/** Goodreads appends the series: "The Hunger Games (The Hunger Games, #1)". */
const SERIES_SUFFIX = /\s*\([^()]*#\s*[\d.]+\)\s*$/;

/**
 * Title keys to try: the full title, then without a subtitle
 * ("Sapiens: A Brief History…", "The Hobbit, or There and Back Again").
 */
export function titleKeys(title: string): string[] {
  const base = title.replace(SERIES_SUFFIX, "").trim();
  const keys = [matchTitle(base)];
  const short = base.split(/:\s|;\s|,\s+or\b/i)[0];
  if (short && short !== base) keys.push(matchTitle(short));
  return [...new Set(keys.filter(Boolean))];
}

/** Last word of a name, normalized: "J. R. R. Tolkien" and "J.R.R. Tolkien" → "tolkien". */
export function surname(name: string): string {
  const words = stripLatinDiacritics(name.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(jr|sr|ii|iii|iv|phd)$/.test(w));
  return words[words.length - 1] ?? "";
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/**
 * Surnames match exactly, or with a small spelling difference for longer names —
 * transliterations vary: Dostoyevsky/Dostoevsky, Tolstoy/Tolstoi, Chekhov/Tchekhov.
 */
export function sameSurname(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  // Different first letters are different people (Sanderson ≠ Anderson).
  if (shorter < 6 || a[0] !== b[0]) return false;
  return editDistance(a, b) <= (shorter >= 9 ? 2 : 1);
}

/** Returns the matched work id for each input (null when not found). */
export async function matchBooks(db: Database, inputs: MatchInput[]): Promise<(number | null)[]> {
  const result: (number | null)[] = inputs.map(() => null);

  const isbns = [...new Set(inputs.map((i) => i.isbn13).filter((i): i is string => !!i))];
  if (isbns.length) {
    const rows = rowsOf<{ isbn13: string; work_id: unknown }>(
      await db.execute(sql`
        select distinct on (e.isbn13) e.isbn13, coalesce(w.merged_into_id, w.id) as work_id
        from editions e join works w on w.id = e.work_id
        where e.isbn13 = any(${arrayParam(isbns)}::text[])
        order by e.isbn13, w.popularity_score desc
      `),
    );
    const byIsbn = new Map(rows.map((r) => [r.isbn13, Number(r.work_id)]));
    inputs.forEach((input, i) => {
      if (input.isbn13) result[i] = byIsbn.get(input.isbn13) ?? null;
    });
  }

  const pending = inputs.map((input, i) => ({ input, i })).filter(({ i }) => result[i] == null);
  const keys = [...new Set(pending.flatMap(({ input }) => titleKeys(input.title)))];
  if (keys.length) {
    const candidates = rowsOf<{ id: unknown; match_title: string; names: string[] }>(
      await db.execute(sql`
        select w.id, w.match_title,
               coalesce(array_agg(a.name) filter (where a.name is not null), '{}') as names
        from works w
        left join work_contributors c on c.work_id = w.id and c.role = 'author'
        left join authors a on a.id = c.author_id
        where w.merged_into_id is null and w.match_title = any(${arrayParam(keys)}::text[])
        group by w.id
        order by w.popularity_score desc
      `),
    );
    for (const { input, i } of pending) {
      const wanted = input.authors.map(surname).filter(Boolean);
      for (const key of titleKeys(input.title)) {
        // Candidates are already most-popular first; require an author surname in common.
        const hit = candidates.find(
          (c) =>
            c.match_title === key &&
            c.names.some((n) => wanted.some((w) => sameSurname(w, surname(n)))),
        );
        if (hit) {
          result[i] = Number(hit.id);
          break;
        }
      }
    }
  }
  return result;
}
