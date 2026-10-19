// Parsing of Open Library bulk dumps (https://openlibrary.org/developers/dumps).
// Main dumps are TSV: type, key, revision, last_modified, JSON.
// Ratings: work_key, edition_key, rating, date. Reading log: work_key, edition_key, shelf, date.

import {
  cleanTitle,
  displayAuthorName,
  matchTitle,
  normalizeFormat,
  parseYear,
  slugify,
  toIsbn10,
  toIsbn13,
} from "@booktrakd/catalog";
import type { StagingRow, StagingTable } from "../import/staging";
import { mapSubjectsToGenres } from "./genres";

export const DUMP_FILES: Record<StagingTable, string> = {
  authors: "ol_dump_authors_latest.txt.gz",
  works: "ol_dump_works_latest.txt.gz",
  editions: "ol_dump_editions_latest.txt.gz",
  ratings: "ol_dump_ratings_latest.txt.gz",
  reading_log: "ol_dump_reading-log_latest.txt.gz",
};

export const dumpUrl = (table: StagingTable) => `https://openlibrary.org/data/${DUMP_FILES[table]}`;

const RECORD_TYPES: Partial<Record<StagingTable, string>> = {
  authors: "/type/author",
  works: "/type/work",
  editions: "/type/edition",
};

const MAX_TEXT = 5000;
const MAX_SUBJECTS = 25;

type Json = Record<string, unknown>;

/** "/works/OL45W" → "OL45W" */
export const olId = (key: string) => key.slice(key.lastIndexOf("/") + 1);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** OL text fields are either a string or { type: "/type/text", value: string }. */
const text = (v: unknown): string | null => {
  const s = str(v) ?? (v && typeof v === "object" ? str((v as Json).value) : null);
  return s ? s.slice(0, MAX_TEXT) : null;
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/** OL uses -1 for removed images. */
const firstImageId = (v: unknown): number | null =>
  Array.isArray(v) ? (v.find((x) => Number.isInteger(x) && x > 0) ?? null) : null;

const keyOf = (v: unknown): string | null =>
  v && typeof v === "object" ? str((v as Json).key) : null;

function parseAuthor(key: string, json: Json): StagingRow | null {
  const primary = str(json.name) ?? str(json.personal_name);
  if (!primary) return null;
  const name = displayAuthorName(primary, strings(json.alternate_names));
  return [
    olId(key),
    name,
    text(json.bio),
    str(json.birth_date),
    str(json.death_date),
    firstImageId(json.photos),
    slugify(name, "author"),
  ];
}

function parseWork(key: string, json: Json): StagingRow | null {
  const rawTitle = str(json.title);
  if (!rawTitle) return null;
  const title = cleanTitle(rawTitle);
  const subjects = strings(json.subjects);
  const authorKeys = [
    ...new Set(
      (Array.isArray(json.authors) ? json.authors : [])
        .map((a) => keyOf((a as Json)?.author) ?? keyOf(a))
        .filter((k): k is string => k !== null)
        .map(olId),
    ),
  ];
  return [
    olId(key),
    title,
    str(json.subtitle),
    matchTitle(title) || title.toLowerCase(),
    slugify(title, "book"),
    text(json.description),
    parseYear(str(json.first_publish_date)),
    firstImageId(json.covers),
    subjects.slice(0, MAX_SUBJECTS),
    mapSubjectsToGenres(subjects),
    authorKeys,
  ];
}

/** Only editions with an ISBN or a cover are kept — the rest add noise, not value. */
function parseEdition(key: string, json: Json): StagingRow | null {
  const workKey = Array.isArray(json.works) ? keyOf(json.works[0]) : null;
  if (!workKey) return null;
  const isbn10s = strings(json.isbn_10);
  const isbn13 = [...strings(json.isbn_13), ...isbn10s].map(toIsbn13).find(Boolean) ?? null;
  const coverId = firstImageId(json.covers);
  if (!isbn13 && !coverId) return null;

  const pages = json.number_of_pages;
  const rawTitle = str(json.title);
  const languageKey = Array.isArray(json.languages) ? keyOf(json.languages[0]) : null;
  const publishDate = str(json.publish_date);
  return [
    olId(key),
    olId(workKey),
    rawTitle ? cleanTitle(rawTitle) : null,
    isbn10s.map(toIsbn10).find(Boolean) ?? null,
    isbn13,
    strings(json.publishers)[0] ?? null,
    publishDate,
    parseYear(publishDate),
    normalizeFormat(str(json.physical_format)),
    Number.isInteger(pages) && (pages as number) > 0 && (pages as number) < 20000
      ? (pages as number)
      : null,
    languageKey ? olId(languageKey) : null,
    coverId,
  ];
}

const SHELVES: Record<string, string> = {
  "want to read": "want",
  "currently reading": "reading",
  "already read": "read",
};

/** Parses one dump line into a staging row, or null if the line should be skipped. */
export function parseDumpLine(table: StagingTable, line: string): StagingRow | null {
  const cols = line.split("\t");

  if (table === "ratings") {
    const rating = Number(cols[2]);
    if (!cols[0] || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
    return [olId(cols[0]), rating];
  }
  if (table === "reading_log") {
    const shelf = SHELVES[(cols[2] ?? "").trim().toLowerCase()];
    if (!cols[0] || !shelf) return null;
    return [olId(cols[0]), shelf];
  }

  if (cols.length < 5 || cols[0] !== RECORD_TYPES[table] || !cols[1]) return null;
  let json: Json;
  try {
    json = JSON.parse(cols.slice(4).join("\t")) as Json;
  } catch {
    return null;
  }
  if (table === "authors") return parseAuthor(cols[1], json);
  if (table === "works") return parseWork(cols[1], json);
  return parseEdition(cols[1], json);
}
