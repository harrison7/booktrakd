import { type Database, rowsOf, sql } from "@booktrakd/db";
import { PgBoss } from "pg-boss";
import { log } from "../log";

export const COVER_QUEUE = "cover.cache";

export interface CoverJob {
  coverId: number;
}

export async function startBoss(databaseUrl: string) {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (error) => console.error("pg-boss error:", error));
  await boss.start();
  if (!(await boss.getQueue(COVER_QUEUE))) {
    await boss.createQueue(COVER_QUEUE, { retryLimit: 5, retryDelay: 60, retryBackoff: true });
  }
  return boss;
}

export async function enqueueCovers(boss: PgBoss, coverIds: number[]) {
  for (let i = 0; i < coverIds.length; i += 1000) {
    await boss.insert(
      COVER_QUEUE,
      coverIds.slice(i, i + 1000).map((coverId) => ({ data: { coverId } satisfies CoverJob })),
    );
  }
}

/** Queues the primary covers of the `top` most popular works that aren't cached yet. */
export async function prefetchCovers(db: Database, boss: PgBoss, top: number) {
  const ids = rowsOf<{ id: unknown }>(
    await db.execute(sql`
      select c.id
      from works w
      join covers c on c.id = w.primary_cover_id
      where w.merged_into_id is null and c.status = 'pending'
      order by w.popularity_score desc
      limit ${top}
    `),
  ).map((r) => Number(r.id));
  await enqueueCovers(boss, ids);
  log(`Queued ${ids.length.toLocaleString()} covers`);
}
