// The book catalog. Everything users do attaches to a *work*; editions hang under works.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createdAt, id, ref, updatedAt } from "./helpers";

export const bookFormat = pgEnum("book_format", [
  "hardcover",
  "paperback",
  "ebook",
  "audiobook",
  "other",
]);

export const contributorRole = pgEnum("contributor_role", [
  "author",
  "editor",
  "illustrator",
  "translator",
  "narrator",
  "contributor",
]);

export const coverSource = pgEnum("cover_source", [
  "openlibrary",
  "google_books",
  "hardcover",
  "upload",
]);

export const coverStatus = pgEnum("cover_status", ["pending", "ready", "missing", "failed"]);

export const series = pgTable("series", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const works = pgTable(
  "works",
  {
    id: id(),
    // Null only for works that were merged away (they redirect via mergedIntoId).
    slug: text("slug").unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    // Title in its original language/script when `title` is an English edition title
    // (e.g. "Преступление и наказание" for Crime and Punishment).
    originalTitle: text("original_title"),
    // Normalized title used for duplicate detection (see worker/src/catalog/normalize.ts).
    matchTitle: text("match_title").notNull(),
    description: text("description"),
    firstPublishedYear: smallint("first_published_year"),
    language: text("language"), // most common edition language, ISO 639-2 (e.g. "eng")
    pageCount: integer("page_count"), // median across editions
    editionCount: integer("edition_count").notNull().default(0),
    subjects: text("subjects").array(), // raw source subjects, capped
    primaryCoverId: ref("primary_cover_id").references((): AnyPgColumn => covers.id, {
      onDelete: "set null",
    }),
    seriesId: ref("series_id").references(() => series.id, { onDelete: "set null" }),
    seriesPosition: real("series_position"),
    popularityScore: real("popularity_score").notNull().default(0),
    mergedIntoId: ref("merged_into_id").references((): AnyPgColumn => works.id),
    olWorkId: text("ol_work_id").unique(), // e.g. "OL45883W"
    hardcoverId: text("hardcover_id"),
    wikidataId: text("wikidata_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("works_match_title_idx").on(t.matchTitle),
    index("works_popularity_idx").on(t.popularityScore.desc()),
    index("works_merged_into_idx").on(t.mergedIntoId),
    index("works_series_idx").on(t.seriesId),
  ],
);

export const editions = pgTable(
  "editions",
  {
    id: id(),
    workId: ref("work_id")
      .notNull()
      .references(() => works.id),
    title: text("title").notNull(),
    isbn10: text("isbn10"),
    isbn13: text("isbn13"),
    publisher: text("publisher"),
    publishDate: text("publish_date"), // free text from the source, e.g. "March 1990"
    publishYear: smallint("publish_year"),
    format: bookFormat("format"),
    pageCount: integer("page_count"),
    language: text("language"),
    olCoverId: integer("ol_cover_id"),
    olEditionId: text("ol_edition_id").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("editions_work_idx").on(t.workId), index("editions_isbn13_idx").on(t.isbn13)],
);

export const authors = pgTable("authors", {
  id: id(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  bio: text("bio"),
  birthDate: text("birth_date"),
  deathDate: text("death_date"),
  olPhotoId: integer("ol_photo_id"),
  mergedIntoId: ref("merged_into_id").references((): AnyPgColumn => authors.id),
  olAuthorId: text("ol_author_id").unique(),
  wikidataId: text("wikidata_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workContributors = pgTable(
  "work_contributors",
  {
    workId: ref("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    authorId: ref("author_id")
      .notNull()
      .references(() => authors.id),
    role: contributorRole("role").notNull().default("author"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.authorId, t.role] }),
    index("work_contributors_author_idx").on(t.authorId),
  ],
);

export const editionContributors = pgTable(
  "edition_contributors",
  {
    editionId: ref("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    authorId: ref("author_id")
      .notNull()
      .references(() => authors.id),
    role: contributorRole("role").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.authorId, t.role] }),
    index("edition_contributors_author_idx").on(t.authorId),
  ],
);

/** Controlled genre list (seeded from src/genres.ts). */
export const genres = pgTable("genres", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  position: smallint("position").notNull(),
});

export const workGenres = pgTable(
  "work_genres",
  {
    workId: ref("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    genreSlug: text("genre_slug")
      .notNull()
      .references(() => genres.slug),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.genreSlug] }),
    index("work_genres_genre_idx").on(t.genreSlug),
  ],
);

/** Cached cover images. `storageKey` is the prefix under which the resized variants live. */
export const covers = pgTable(
  "covers",
  {
    id: id(),
    workId: ref("work_id").references((): AnyPgColumn => works.id, { onDelete: "cascade" }),
    editionId: ref("edition_id").references(() => editions.id, { onDelete: "cascade" }),
    source: coverSource("source").notNull(),
    sourceId: text("source_id").notNull(),
    status: coverStatus("status").notNull().default("pending"),
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    dominantColor: text("dominant_color"), // "#rrggbb"
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("covers_source_unique").on(t.source, t.sourceId),
    index("covers_work_idx").on(t.workId),
  ],
);

/** Denormalized per-work counters, recomputed by background jobs. */
export const workStats = pgTable("work_stats", {
  workId: ref("work_id")
    .primaryKey()
    .references(() => works.id, { onDelete: "cascade" }),
  // Count of ratings at each half-star step: index 0 = ½ star … index 9 = 5 stars.
  histogram: integer("histogram").array().notNull().default(sql`'{0,0,0,0,0,0,0,0,0,0}'`),
  ratingCount: integer("rating_count").notNull().default(0),
  ratingAvg: real("rating_avg"),
  readCount: integer("read_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  listCount: integer("list_count").notNull().default(0),
  readingListCount: integer("reading_list_count").notNull().default(0),
  weeklyActivity: integer("weekly_activity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
