// Parses Goodreads and StoryGraph library exports into one common row shape.
import { type BookFormat, normalizeFormat, toIsbn13 } from "@booktrakd/catalog";
import Papa from "papaparse";

export type ImportSource = "goodreads" | "storygraph";
export type ImportStatus = "read" | "to-read" | "reading" | "dnf";

export interface ImportRow {
  title: string;
  authors: string[];
  isbn13: string | null;
  /** 1–10 (half stars) */
  rating: number | null;
  status: ImportStatus | null;
  /** YYYY-MM-DD */
  dateRead: string | null;
  review: string | null;
  spoilers: boolean;
  reread: boolean;
  format: BookFormat | null;
  tags: string[];
}

type Raw = Record<string, string | undefined>;

const DNF_SHELF = /\b(dnf|did[- ]not[- ]finish|abandon(ed)?|gave[- ]up)\b/i;

/** "2023/05/14" or "2023-05-14" → "2023-05-14"; anything else → null. */
export function parseDate(value: string | undefined): string | null {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value?.trim() ?? "");
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000 ? null : iso;
}

/** Goodreads reviews are HTML; keep paragraphs, drop markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ratings: Goodreads 0–5 (0 = none); StoryGraph 0.25-steps → nearest half star. */
function toRating(value: string | undefined): number | null {
  const stars = Number(value);
  if (!value?.trim() || !Number.isFinite(stars) || stars <= 0) return null;
  return Math.min(10, Math.max(1, Math.round(stars * 2)));
}

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function fromGoodreads(r: Raw): ImportRow {
  // ISBNs are exported as ="0441013597" to stop spreadsheets mangling them.
  const isbn = (v: string | undefined) => (v ?? "").replace(/[="]/g, "");
  const shelf = (r["Exclusive Shelf"] ?? "").trim().toLowerCase();
  const shelves = splitList(r.Bookshelves).map((s) => s.toLowerCase());
  const status: ImportStatus | null =
    shelf === "read"
      ? "read"
      : shelf === "to-read"
        ? "to-read"
        : shelf === "currently-reading"
          ? "reading"
          : DNF_SHELF.test(shelf) || shelves.some((s) => DNF_SHELF.test(s))
            ? "dnf"
            : null;
  const review = htmlToText(r["My Review"] ?? "");
  return {
    title: (r.Title ?? "").trim(),
    authors: [r.Author ?? "", ...splitList(r["Additional Authors"])]
      .map((a) => a.trim())
      .filter(Boolean),
    isbn13: toIsbn13(isbn(r.ISBN13)) ?? toIsbn13(isbn(r.ISBN)),
    rating: toRating(r["My Rating"]),
    status,
    dateRead: parseDate(r["Date Read"]),
    review: review || null,
    spoilers: (r.Spoiler ?? "").trim().toLowerCase() === "true",
    reread: Number(r["Read Count"]) > 1,
    format: normalizeFormat(r.Binding),
    tags: shelves.filter(
      (s) =>
        !["read", "to-read", "currently-reading"].includes(s) && s !== shelf && !DNF_SHELF.test(s),
    ),
  };
}

function fromStoryGraph(r: Raw): ImportRow {
  const statusMap: Record<string, ImportStatus> = {
    read: "read",
    "to-read": "to-read",
    "currently-reading": "reading",
    "did-not-finish": "dnf",
  };
  const format = (r.Format ?? "").toLowerCase();
  return {
    title: (r.Title ?? "").trim(),
    authors: splitList(r.Authors),
    isbn13: toIsbn13(r["ISBN/UID"]),
    rating: toRating(r["Star Rating"]),
    status: statusMap[(r["Read Status"] ?? "").trim().toLowerCase()] ?? null,
    dateRead: parseDate(r["Last Date Read"]),
    review: htmlToText(r.Review ?? "") || null,
    spoilers: false,
    reread: Number(r["Read Count"]) > 1,
    format:
      format === "digital" ? "ebook" : format === "audio" ? "audiobook" : normalizeFormat(format),
    tags: splitList(r.Tags).map((t) => t.toLowerCase()),
  };
}

export class LibraryCsvError extends Error {}

/** Detects the export format from its header and parses every row. */
export function parseLibraryCsv(csv: string): { source: ImportSource; rows: ImportRow[] } {
  const parsed = Papa.parse<Raw>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  const source: ImportSource | null = fields.includes("Exclusive Shelf")
    ? "goodreads"
    : fields.includes("Read Status") && fields.includes("Star Rating")
      ? "storygraph"
      : null;
  if (!source) {
    throw new LibraryCsvError(
      "That doesn't look like a Goodreads or StoryGraph export. Upload the CSV file they email or download for you.",
    );
  }
  const convert = source === "goodreads" ? fromGoodreads : fromStoryGraph;
  const rows = parsed.data.map(convert).filter((row) => row.title);
  return { source, rows };
}
