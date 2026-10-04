// Text normalization for catalog data: display-title cleanup, duplicate-matching keys,
// URL slugs, and parsing of messy source fields (years, ISBNs, formats).

/** Words that mark a trailing "(…)" / "[…]" as an edition note rather than part of the title. */
const EDITION_NOTE_WORDS = [
  "edition",
  "ed\\.",
  "classics?",
  "unabridged",
  "abridged",
  "paperback",
  "hardcover",
  "hardback",
  "illustrated",
  "annotated",
  "reprint",
  "large print",
  "mass market",
  "audio ?book",
  "kindle",
  "e-?book",
  "collector'?s",
  "deluxe",
  "anniversary",
  "movie tie-?in",
  "vintage",
  "penguin",
  "signet",
  "bantam",
  "wordsworth",
  "everyman'?s",
  "oxford world'?s",
];

const TRAILING_EDITION_NOTE = new RegExp(
  `\\s*[(\\[][^()\\[\\]]*\\b(?:${EDITION_NOTE_WORDS.join("|")})[^()\\[\\]]*[)\\]]\\s*$`,
  "i",
);
const TRAILING_GENRE_LABEL = /\s*[:\-–—]\s*(?:a novel|a memoir|a thriller|novel|roman)\s*$/i;
// MARC-derived titles often end in " /" or " :".
const TRAILING_PUNCTUATION = /[\s/:;,]+$/;

/** Cleans a title for display: strips edition notes and catalog punctuation. */
export function cleanTitle(title: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  for (let previous = ""; previous !== t; ) {
    previous = t;
    t = t
      .replace(TRAILING_EDITION_NOTE, "")
      .replace(TRAILING_GENRE_LABEL, "")
      .replace(TRAILING_PUNCTUATION, "");
  }
  return t || title.trim();
}

/** Removes accents from Latin letters only, so other scripts are left intact. */
export function stripLatinDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC");
}

/**
 * Key used to detect duplicate works: lowercase, no accents/punctuation/leading article.
 * "The Lord of the Rings (Deluxe Edition)" → "lord of the rings".
 */
export function matchTitle(title: string): string {
  return stripLatinDiacritics(cleanTitle(title).toLowerCase())
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:the|a|an) /, "");
}

/** URL slug. Keeps non-Latin letters (valid in modern URLs); falls back when nothing is left. */
export function slugify(text: string, fallback: string): string {
  const slug = stripLatinDiacritics(text.toLowerCase())
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** First plausible 4-digit year in a free-text date ("March 1990", "c1985", "1999-05-01"). */
export function parseYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(?<!\d)(1\d{3}|20\d{2})(?!\d)/.exec(text);
  if (!match?.[1]) return null;
  const year = Number(match[1]);
  return year <= new Date().getFullYear() + 1 ? year : null;
}

export type BookFormat = "hardcover" | "paperback" | "ebook" | "audiobook" | "other";

export function normalizeFormat(physicalFormat: string | null | undefined): BookFormat | null {
  if (!physicalFormat?.trim()) return null;
  const f = physicalFormat.toLowerCase();
  if (/audio|\bcd\b|mp3|cassette/.test(f)) return "audiobook";
  if (/e-?book|kindle|electronic|epub|\bpdf\b|digital/.test(f)) return "ebook";
  if (/hard ?(?:cover|back)|library binding|cloth|board/.test(f)) return "hardcover";
  if (/paper ?back|mass market|trade paper|soft ?cover|pocket/.test(f)) return "paperback";
  return "other";
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = isbn[i] as string;
    sum += (ch === "X" ? 10 : Number(ch)) * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function isValidIsbn13(isbn: string): boolean {
  return /^97[89]\d{10}$/.test(isbn) && isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12]);
}

/** Returns a valid ISBN-13 for any valid ISBN-10/13 input (hyphens/spaces allowed), else null. */
export function toIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const isbn = raw.toUpperCase().replace(/[^0-9X]/g, "");
  if (isbn.length === 13) return isValidIsbn13(isbn) ? isbn : null;
  if (isbn.length === 10 && isValidIsbn10(isbn)) {
    const first12 = `978${isbn.slice(0, 9)}`;
    return first12 + isbn13CheckDigit(first12);
  }
  return null;
}

/** Returns a valid ISBN-10, else null. */
export function toIsbn10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const isbn = raw.toUpperCase().replace(/[^0-9X]/g, "");
  return isValidIsbn10(isbn) ? isbn : null;
}
