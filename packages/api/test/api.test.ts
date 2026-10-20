// API behaviour against an in-memory Postgres with the real migrations.
import type { Auth } from "@booktrakd/auth";
import { type Database, rowsOf, sql } from "@booktrakd/db";
import { createTestDb } from "@booktrakd/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { createCaller } from "../src";
import { applyShelfPatch, EMPTY_SHELF } from "../src/lib/shelf-rules";

let db: Database;
let duneId: number;
let hobbitId: number;

/** A caller signed in as `userId` (or signed out), with search/queue disabled. */
function callerAs(userId: string | null) {
  const auth = {
    api: {
      getSession: async () =>
        userId ? { user: { id: userId, username: userId, name: userId, role: "user" } } : null,
    },
  } as unknown as Auth;
  return createCaller(async () => ({
    db,
    auth,
    search: null,
    enqueueCover: async () => {},
    user: userId ? { id: userId, username: userId, name: userId, role: "user" } : null,
  }));
}

async function insertUser(id: string) {
  await db.execute(sql`
    insert into users (id, name, email, username) values (${id}, ${id}, ${`${id}@example.com`}, ${id})
  `);
}

async function insertWork(slug: string, title: string, author: string) {
  const [w] = rowsOf<{ id: unknown }>(
    await db.execute(sql`
      insert into works (slug, title, match_title, first_published_year, popularity_score)
      values (${slug}, ${title}, ${title.toLowerCase()}, 1965, 1) returning id
    `),
  );
  const [a] = rowsOf<{ id: unknown }>(
    await db.execute(
      sql`insert into authors (slug, name) values (${`${slug}-author`}, ${author}) returning id`,
    ),
  );
  await db.execute(sql`
    insert into work_contributors (work_id, author_id, role, position) values (${Number(w?.id)}, ${Number(a?.id)}, 'author', 0)
  `);
  return Number(w?.id);
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  await insertUser("alice");
  await insertUser("bob");
  duneId = await insertWork("dune", "Dune", "Frank Herbert");
  hobbitId = await insertWork("the-hobbit", "The Hobbit", "J.R.R. Tolkien");
}, 60_000);

describe("shelf rules", () => {
  it("rating or liking a book marks it read and clears 'next' states", () => {
    const listed = { ...EMPTY_SHELF, readingList: true, currentlyReading: true };
    expect(applyShelfPatch(listed, { rating: 8 })).toMatchObject({
      read: true,
      rating: 8,
      readingList: false,
      currentlyReading: false,
    });
    expect(applyShelfPatch(EMPTY_SHELF, { liked: true }).read).toBe(true);
  });

  it("lets a read book be started again or re-added to the reading list (rereads)", () => {
    const read = { ...EMPTY_SHELF, read: true, rating: 6 };
    expect(applyShelfPatch(read, { currentlyReading: true })).toMatchObject({
      read: true,
      currentlyReading: true,
    });
    expect(applyShelfPatch(read, { readingList: true })).toMatchObject({
      read: true,
      readingList: true,
    });
  });

  it("DNF stops reading and leaves the reading list, but keeps an earlier read", () => {
    const state = { ...EMPTY_SHELF, read: true, currentlyReading: true, readingList: true };
    expect(applyShelfPatch(state, { dnf: true })).toMatchObject({
      read: true,
      dnf: true,
      currentlyReading: false,
      readingList: false,
    });
  });

  it("clearing a rating doesn't un-read the book", () => {
    const rated = { ...EMPTY_SHELF, read: true, rating: 7 };
    expect(applyShelfPatch(rated, { rating: null })).toMatchObject({ read: true, rating: null });
  });
});

describe("shelf API", () => {
  it("requires sign-in", async () => {
    await expect(
      callerAs(null).shelf.update({ workId: duneId, patch: { read: true } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("saves state and updates the book's counters", async () => {
    const alice = callerAs("alice");
    await alice.shelf.update({ workId: duneId, patch: { readingList: true } });
    let book = await alice.catalog.work({ slug: "dune" });
    expect(book.shelf?.readingList).toBe(true);
    expect(book.stats.readingListCount).toBe(1);

    await alice.shelf.update({ workId: duneId, patch: { rating: 9 } });
    book = await alice.catalog.work({ slug: "dune" });
    expect(book.shelf).toMatchObject({ read: true, rating: 9, readingList: false });
    expect(book.stats).toMatchObject({ readCount: 1, ratingCount: 1, readingListCount: 0 });
    expect(book.stats.histogram[8]).toBe(1); // index 8 = 4½ stars
  });

  it("keeps a book's reading-list position when it's re-saved", async () => {
    const bob = callerAs("bob");
    await bob.shelf.update({ workId: hobbitId, patch: { readingList: true } });
    await bob.shelf.update({ workId: duneId, patch: { readingList: true } });
    await bob.shelf.update({ workId: hobbitId, patch: { liked: false } }); // unrelated change
    const list = await bob.users.readingList({ username: "bob" });
    expect(list.map((b) => b.slug)).toEqual(["dune", "the-hobbit"]); // newest first
  });
});

describe("diary entries", () => {
  it("logging a review marks the book read and shows up everywhere", async () => {
    const alice = callerAs("alice");
    const { id, shelf } = await alice.entries.create({
      workId: hobbitId,
      finishedOn: "2026-10-01",
      rating: 8,
      liked: true,
      review: "  There and back again.  ",
      spoilers: true,
      tags: ["Fantasy", "fantasy", " cozy "],
    });
    expect(shelf).toMatchObject({ read: true, rating: 8, liked: true });

    const entry = await alice.entries.get({ id });
    expect(entry).toMatchObject({ text: "There and back again.", spoilers: true, rating: 8 });
    expect(entry.tags).toEqual(["cozy", "fantasy"]);

    const book = await callerAs(null).catalog.work({ slug: "the-hobbit" });
    expect(book.reviews.map((r) => r.id)).toContain(id);
    expect(book.stats.reviewCount).toBe(1);

    const profile = await callerAs(null).users.profile({ username: "alice" });
    expect(profile.counts).toMatchObject({ read: 2, reviews: 1 });
    expect(profile.recentEntries[0]?.book.slug).toBe("the-hobbit");
  });

  it("a DNF log doesn't mark the book read", async () => {
    const bob = callerAs("bob");
    const { shelf } = await bob.entries.create({ workId: duneId, dnf: true, rating: 4 });
    expect(shelf).toMatchObject({ read: false, dnf: true, readingList: false });
  });

  it("only the author can delete an entry", async () => {
    const alice = callerAs("alice");
    const { id } = await alice.entries.create({ workId: duneId, review: "Spice." });
    await expect(callerAs("bob").entries.delete({ id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await alice.entries.delete({ id });
    await expect(alice.entries.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("only the author can edit an entry, and edits carry onto the book", async () => {
    const alice = callerAs("alice");
    const { id } = await alice.entries.create({
      workId: duneId,
      startedOn: "2026-09-01",
      finishedOn: "2026-09-20",
    });
    const edit = { id, startedOn: "2026-09-01", finishedOn: "2026-09-21", tags: ["sci-fi"] };
    await expect(callerAs("bob").entries.update(edit)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const { shelf } = await alice.entries.update({
      ...edit,
      rating: 9,
      liked: true,
      review: "Better the second time.",
    });
    expect(shelf).toMatchObject({ read: true, rating: 9, liked: true });

    const entry = await alice.entries.get({ id });
    expect(entry).toMatchObject({
      startedOn: "2026-09-01",
      finishedOn: "2026-09-21",
      text: "Better the second time.",
      tags: ["sci-fi"],
    });
    const book = await callerAs(null).catalog.work({ slug: "dune" });
    expect(book.reviews.map((r) => r.id)).toContain(id);
    await alice.entries.delete({ id });
  });

  it("lists a diary newest first", async () => {
    const alice = callerAs("alice");
    await alice.entries.create({ workId: duneId, finishedOn: "2026-10-05" });
    const { entries } = await alice.entries.diary({ username: "alice" });
    expect(entries.map((e) => e.finishedOn)).toEqual(["2026-10-05", "2026-10-01"]);
  });
});

describe("profiles", () => {
  it("stores the Favorite Four in order", async () => {
    const alice = callerAs("alice");
    await alice.users.setFavorites({ workIds: [hobbitId, duneId, hobbitId] });
    const profile = await alice.users.profile({ username: "alice" });
    expect(profile.favorites.map((b) => b.slug)).toEqual(["the-hobbit", "dune"]);
    expect(profile.isMe).toBe(true);
  });

  it("404s for unknown members and books", async () => {
    await expect(callerAs(null).users.profile({ username: "nobody" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerAs(null).catalog.work({ slug: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("search without Meilisearch", () => {
  it("falls back to a Postgres title match", async () => {
    const results = await callerAs(null).search.books({ q: "hobb" });
    expect(results.map((r) => r.title)).toEqual(["The Hobbit"]);
    expect(results[0]?.authors).toBe("J.R.R. Tolkien");
  });
});
