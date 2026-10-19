// Goodreads / StoryGraph import and CSV export.
import type { Auth } from "@booktrakd/auth";
import { matchTitle } from "@booktrakd/catalog";
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { createTestDb } from "@booktrakd/db/testing";
import Papa from "papaparse";
import { beforeAll, describe, expect, it } from "vitest";
import { createCaller } from "../src";
import { exportDiaryCsv, exportLibraryCsv } from "../src/lib/export";
import { htmlToText, parseDate, parseLibraryCsv } from "../src/lib/library-csv";
import { sameSurname, surname, titleKeys } from "../src/lib/match-books";

// Real Goodreads export header and representative rows.
const GOODREADS = `Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies
234225,"Dune (Dune, #1)",Frank Herbert,"Herbert, Frank",,"=""0441013597""","=""9780441013593""",5,4.27,Ace,Mass Market Paperback,688,2005,1965,2023/05/14,2023/01/02,"sci-fi, favorites","sci-fi (#3), favorites (#1)",read,"Loved it.<br/><br/>The spice &amp; the worms!",true,,2,0
5907,"The Hobbit, or There and Back Again",J.R.R. Tolkien,"Tolkien, J.R.R.",,"=""""","=""""",0,4.29,Houghton,Paperback,366,2012,1937,,2024/01/02,to-read,to-read (#1),to-read,,,,0,0
77,Sapiens: A Brief History of Humankind,Yuval Noah Harari,"Harari, Yuval Noah",,"=""""","=""""",4,4.39,Harper,Hardcover,443,2015,2011,,2024/03/01,currently-reading,currently-reading (#1),currently-reading,,,,0,0
1,Some Unknown Book,Nobody Real,"Real, Nobody",,"=""""","=""""",3,3.5,X,Hardcover,100,2020,2020,2024/02/01,2024/02/01,,,read,,,,1,0
2,Abandoned Book,J.R.R. Tolkien,"Tolkien, J.R.R.",,"=""""","=""""",0,3,X,Paperback,10,2020,2020,,2024/02/01,did-not-finish,did-not-finish (#1),did-not-finish,,,,0,0
`;

const STORYGRAPH = `Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Character- or Plot-Driven?,Strong Character Development?,Loveable Characters?,Diverse Characters?,Flawed Characters?,Star Rating,Review,Content Warnings,Content Warning Description,Tags,Owned?
Dune,Frank Herbert,,9780441013593,paperback,read,2023/01/01,2023/05/14,2023/04/01-2023/05/14,1,adventurous,slow,Plot,Yes,No,No,Yes,4.25,Great,,,"sci-fi, Classics",No
The Hobbit,J. R. R. Tolkien,,,digital,did-not-finish,2023/01/01,,,0,,,,,,,,,,,,,No
`;

let db: Database;
let duneId: number;
let hobbitId: number;

function callerAs(userId: string) {
  const user = { id: userId, username: userId, name: userId, role: "user" };
  return createCaller(async () => ({
    db,
    auth: { api: { getSession: async () => ({ user }) } } as unknown as Auth,
    search: null,
    enqueueCover: async () => {},
    user,
  }));
}

async function insertWork(slug: string, title: string, author: string, isbn13?: string) {
  const [w] = rowsOf<{ id: unknown }>(
    await db.execute(sql`
      insert into works (slug, title, match_title, popularity_score)
      values (${slug}, ${title}, ${matchTitle(title)}, 1) returning id
    `),
  );
  const id = Number(w?.id);
  const [a] = rowsOf<{ id: unknown }>(
    await db.execute(sql`insert into authors (name) values (${author}) returning id`),
  );
  await db.execute(sql`
    insert into work_contributors (work_id, author_id, role, position) values (${id}, ${Number(a?.id)}, 'author', 0)
  `);
  if (isbn13) {
    await db.execute(
      sql`insert into editions (work_id, title, isbn13) values (${id}, ${title}, ${isbn13})`,
    );
  }
  return id;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  for (const id of ["gr", "sg"]) {
    await db.execute(sql`
      insert into users (id, name, email, username) values (${id}, ${id}, ${`${id}@example.com`}, ${id})
    `);
  }
  duneId = await insertWork("dune", "Dune", "Frank Herbert", "9780441013593");
  hobbitId = await insertWork("the-hobbit", "The Hobbit", "J.R.R. Tolkien");
  await insertWork("sapiens", "Sapiens", "Yuval Noah Harari");
  // Same title, different author: must not match the Goodreads Hobbit row.
  await insertWork("the-hobbit-2", "The Hobbit", "Someone Else");
}, 60_000);

describe("parsing exports", () => {
  it("parses Goodreads rows", () => {
    const { source, rows } = parseLibraryCsv(GOODREADS);
    expect(source).toBe("goodreads");
    expect(rows[0]).toEqual({
      title: "Dune (Dune, #1)",
      authors: ["Frank Herbert"],
      isbn13: "9780441013593",
      rating: 10,
      status: "read",
      dateRead: "2023-05-14",
      review: "Loved it.\n\nThe spice & the worms!",
      spoilers: true,
      reread: true,
      format: "paperback",
      tags: ["sci-fi", "favorites"],
    });
    expect(rows.map((r) => r.status)).toEqual(["read", "to-read", "reading", "read", "dnf"]);
    expect(rows[1]).toMatchObject({ rating: null, isbn13: null, dateRead: null });
  });

  it("parses StoryGraph rows, rounding quarter stars to half stars", () => {
    const { source, rows } = parseLibraryCsv(STORYGRAPH);
    expect(source).toBe("storygraph");
    expect(rows[0]).toMatchObject({ rating: 9, status: "read", tags: ["sci-fi", "classics"] });
    expect(rows[1]).toMatchObject({ status: "dnf", format: "ebook", rating: null });
  });

  it("rejects other CSVs with a helpful message", () => {
    expect(() => parseLibraryCsv("a,b\n1,2")).toThrow(/Goodreads or StoryGraph/);
  });

  it("normalizes dates, HTML and names", () => {
    expect(parseDate("2023/5/4")).toBe("2023-05-04");
    expect(parseDate("not a date")).toBeNull();
    expect(htmlToText("<p>One</p><p>Two &quot;quoted&quot;</p>")).toBe('One\n\nTwo "quoted"');
    expect(surname("J. R. R. Tolkien")).toBe(surname("J.R.R. Tolkien"));
    expect(sameSurname("dostoyevsky", "dostoevsky")).toBe(true);
    expect(sameSurname("tolstoy", "tolstoi")).toBe(true);
    expect(sameSurname("green", "greer")).toBe(false); // short names must match exactly
    expect(sameSurname("sanderson", "anderson")).toBe(false);
    expect(titleKeys("The Hunger Games (The Hunger Games, #1)")).toEqual(["hunger games"]);
    expect(titleKeys("Sapiens: A Brief History of Humankind")).toContain("sapiens");
  });
});

describe("import API", () => {
  it("previews matches by ISBN, then title + author", async () => {
    const preview = await callerAs("gr").imports.preview({ csv: GOODREADS });
    expect(preview.rows.map((r) => r.match?.slug ?? null)).toEqual([
      "dune", // ISBN
      "the-hobbit", // title before ", or" + author surname (not the other author's Hobbit)
      "sapiens", // title before ":"
      null, // not in the catalog
      null, // no book with that title
    ]);
  });

  it("commits shelves, ratings and diary entries — and is safe to re-run", async () => {
    const caller = callerAs("gr");
    const preview = await caller.imports.preview({ csv: GOODREADS });
    const rows = preview.rows
      .filter((r) => r.match)
      .map(({ match, title: _t, authors: _a, isbn13: _i, ...row }) => ({
        ...row,
        workId: match?.id as number,
      }));

    const first = await caller.imports.commit({
      importId: null,
      source: "goodreads",
      rows,
      unmatched: 2,
      final: true,
    });
    expect(first).toMatchObject({ books: 3, entries: 1 });

    const dune = await caller.catalog.work({ slug: "dune" });
    expect(dune.shelf).toMatchObject({ read: true, rating: 10 });
    const hobbit = await caller.catalog.work({ slug: "the-hobbit" });
    expect(hobbit.shelf).toMatchObject({ readingList: true, read: false });
    const sapiens = await caller.catalog.work({ slug: "sapiens" });
    expect(sapiens.shelf).toMatchObject({ currentlyReading: true });

    const { entries } = await caller.entries.diary({ username: "gr" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      finishedOn: "2023-05-14",
      rating: 10,
      reread: true,
      spoilers: true,
      text: "Loved it.\n\nThe spice & the worms!",
    });

    // Importing the same file again doesn't duplicate diary entries.
    const again = await caller.imports.commit({
      importId: null,
      source: "goodreads",
      rows,
      final: true,
    });
    expect(again.entries).toBe(0);

    const [record] = rowsOf<{ status: string; stats: { books: number; unmatched: number } }>(
      await db.execute(sql`select status, stats from imports where id = ${first.importId}`),
    );
    expect(record).toMatchObject({ status: "done", stats: { books: 3, entries: 1, unmatched: 2 } });
  });

  it("imports StoryGraph DNFs without marking them read", async () => {
    const caller = callerAs("sg");
    const preview = await caller.imports.preview({ csv: STORYGRAPH });
    const rows = preview.rows
      .filter((r) => r.match)
      .map(({ match, title: _t, authors: _a, isbn13: _i, ...row }) => ({
        ...row,
        workId: match?.id as number,
      }));
    expect(rows.map((r) => r.workId)).toEqual([duneId, hobbitId]);
    await caller.imports.commit({ importId: null, source: "storygraph", rows, final: true });
    const hobbit = await caller.catalog.work({ slug: "the-hobbit" });
    expect(hobbit.shelf).toMatchObject({ dnf: true, read: false });
  });

  it("won't let one member add to another's import", async () => {
    const mine = await callerAs("gr").imports.commit({
      importId: null,
      source: "goodreads",
      rows: [],
      final: false,
    });
    await expect(
      callerAs("sg").imports.commit({
        importId: mine.importId,
        source: "goodreads",
        rows: [],
        final: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("export", () => {
  it("exports the library and diary as CSV", async () => {
    const library = Papa.parse<Record<string, string>>(await exportLibraryCsv(db, "gr"), {
      header: true,
    }).data;
    expect(library.find((r) => r.Title === "Dune")).toMatchObject({
      Read: "yes",
      Rating: "5",
      ISBN13: "9780441013593",
      Authors: "Frank Herbert",
    });
    expect(library.find((r) => r.Title === "The Hobbit")?.["Reading List"]).toBe("yes");

    const diary = Papa.parse<Record<string, string>>(await exportDiaryCsv(db, "gr"), {
      header: true,
    }).data;
    expect(diary).toEqual([
      expect.objectContaining({
        Title: "Dune",
        "Date Read": "2023-05-14",
        Rating: "5",
        Reread: "yes",
      }),
    ]);
  });
});
