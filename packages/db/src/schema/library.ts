// What users do with books: shelf state, diary entries/reviews, lists, favorites, goals.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { bookFormat, editions, works } from "./catalog";
import { createdAt, id, ref, updatedAt } from "./helpers";

const userRef = (name: string) =>
  text(name)
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

const workRef = () =>
  ref("work_id")
    .notNull()
    .references(() => works.id);

/**
 * One row per (user, work): the book's current state for that user, like Letterboxd's
 * watched/liked/rating/watchlist. Ratings are stored as 1–10 (half stars).
 */
export const userWorks = pgTable(
  "user_works",
  {
    userId: userRef("user_id"),
    workId: workRef(),
    isRead: boolean("is_read").notNull().default(false),
    isLiked: boolean("is_liked").notNull().default(false),
    rating: smallint("rating"),
    onReadingList: boolean("on_reading_list").notNull().default(false),
    readingListPosition: doublePrecision("reading_list_position"),
    readingListAddedAt: timestamp("reading_list_added_at", { withTimezone: true }),
    isCurrentlyReading: boolean("is_currently_reading").notNull().default(false),
    isDnf: boolean("is_dnf").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workId] }),
    check("user_works_rating_range", sql`${t.rating} between 1 and 10`),
    index("user_works_work_idx").on(t.workId),
    index("user_works_reading_list_idx")
      .on(t.userId, t.readingListPosition)
      .where(sql`${t.onReadingList}`),
  ],
);

/** Diary entries. A review is an entry with `reviewText`; `finishedOn` may be null. */
export const entries = pgTable(
  "entries",
  {
    id: id(),
    userId: userRef("user_id"),
    workId: workRef(),
    editionId: ref("edition_id").references(() => editions.id, { onDelete: "set null" }),
    format: bookFormat("format"),
    startedOn: date("started_on"),
    finishedOn: date("finished_on"),
    rating: smallint("rating"),
    isLiked: boolean("is_liked").notNull().default(false),
    isReread: boolean("is_reread").notNull().default(false),
    isDnf: boolean("is_dnf").notNull().default(false),
    reviewText: text("review_text"),
    containsSpoilers: boolean("contains_spoilers").notNull().default(false),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("entries_rating_range", sql`${t.rating} between 1 and 10`),
    index("entries_user_diary_idx").on(t.userId, t.finishedOn.desc()),
    index("entries_work_idx").on(t.workId, t.createdAt.desc()),
    index("entries_work_reviews_idx")
      .on(t.workId, t.likeCount.desc())
      .where(sql`${t.reviewText} is not null`),
  ],
);

export const entryTags = pgTable(
  "entry_tags",
  {
    entryId: ref("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tag] }), index("entry_tags_tag_idx").on(t.tag)],
);

export const listVisibility = pgEnum("list_visibility", ["public", "unlisted", "private"]);

export const lists = pgTable(
  "lists",
  {
    id: id(),
    userId: userRef("user_id"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    isRanked: boolean("is_ranked").notNull().default(false),
    visibility: listVisibility("visibility").notNull().default("public"),
    itemCount: integer("item_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("lists_user_slug_unique").on(t.userId, t.slug)],
);

export const listItems = pgTable(
  "list_items",
  {
    listId: ref("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    workId: workRef(),
    position: doublePrecision("position").notNull(),
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.workId] }),
    index("list_items_order_idx").on(t.listId, t.position),
    index("list_items_work_idx").on(t.workId),
  ],
);

export const listTags = pgTable(
  "list_tags",
  {
    listId: ref("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.tag] }), index("list_tags_tag_idx").on(t.tag)],
);

/** Profile "Favorite Four". */
export const favorites = pgTable(
  "favorites",
  {
    userId: userRef("user_id"),
    position: smallint("position").notNull(),
    workId: workRef(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.position] }),
    check("favorites_position_range", sql`${t.position} between 1 and 4`),
  ],
);

export const readingGoals = pgTable(
  "reading_goals",
  {
    userId: userRef("user_id"),
    year: smallint("year").notNull(),
    target: integer("target").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.year] })],
);
