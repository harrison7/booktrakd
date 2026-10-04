import { sql } from "drizzle-orm";
import { GENRES } from "./genres";
import type { Database } from "./index";
import { genres } from "./schema";

export async function seedGenres(db: Database) {
  await db
    .insert(genres)
    .values(GENRES.map((g, i) => ({ slug: g.slug, name: g.name, position: i })))
    .onConflictDoUpdate({
      target: genres.slug,
      set: { name: sql`excluded.name`, position: sql`excluded.position` },
    });
}
