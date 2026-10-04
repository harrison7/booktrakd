import { z } from "zod";

/** Ratings are stored as 1–10 and shown as ½–5 stars. */
export const rating = z.number().int().min(1).max(10);

export const ratingToStars = (value: number) => value / 2;
export const starsToRating = (stars: number) => Math.round(stars * 2);

export const RESERVED_USERNAMES = [
  "admin",
  "api",
  "activity",
  "author",
  "book",
  "books",
  "librarian",
  "lists",
  "members",
  "search",
  "series",
  "settings",
  "sign-in",
  "sign-up",
] as const;

export const username = z
  .string()
  .min(2)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only")
  .refine(
    (u) => !(RESERVED_USERNAMES as readonly string[]).includes(u.toLowerCase()),
    "That username is reserved",
  );

export const bookFormat = z.enum(["hardcover", "paperback", "ebook", "audiobook", "other"]);
