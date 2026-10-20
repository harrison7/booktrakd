// Activity rows feed the friends feed (fan-out on read). Each row reflects something that's
// still true: repeating an action replaces its row, and undoing it removes the row, so
// re-rating a book five times shows once and an unlike leaves nothing behind.
import { type Database, sql } from "@booktrakd/db";
import type { ShelfState } from "./shelf-rules";

export type ActivityVerb =
  | "read"
  | "rated"
  | "liked_work"
  | "logged"
  | "reviewed"
  | "added_to_reading_list"
  | "started_reading"
  | "created_list"
  | "liked_entry"
  | "liked_list"
  | "followed";

export interface ActivityObject {
  type: "work" | "entry" | "list" | "user";
  id: string | number;
}

/** Records an activity, replacing the actor's earlier one for the same verb and object. */
export async function recordActivity(
  db: Database,
  actorId: string,
  verb: ActivityVerb,
  object: ActivityObject,
  workId: number | null = null,
) {
  await removeActivity(db, actorId, verb, object);
  await db.execute(sql`
    insert into activities (actor_id, verb, object_type, object_id, work_id)
    values (${actorId}, ${verb}, ${object.type}, ${String(object.id)}, ${workId})
  `);
}

export async function removeActivity(
  db: Database,
  actorId: string,
  verb: ActivityVerb,
  object: ActivityObject,
) {
  await db.execute(sql`
    delete from activities
    where actor_id = ${actorId} and verb = ${verb}
      and object_type = ${object.type} and object_id = ${String(object.id)}
  `);
}

/** Removes every activity about an object (e.g. a deleted entry), whoever the actor. */
export async function removeActivitiesFor(db: Database, object: ActivityObject) {
  await db.execute(sql`
    delete from activities where object_type = ${object.type} and object_id = ${String(object.id)}
  `);
}

const SHELF_VERBS = [
  ["rating", "rated"],
  ["liked", "liked_work"],
  ["read", "read"],
  ["readingList", "added_to_reading_list"],
  ["currentlyReading", "started_reading"],
] as const satisfies readonly (readonly [keyof ShelfState, ActivityVerb])[];

/**
 * Syncs a book's shelf activities after a change from `before` to `after`: a state that was
 * turned on (or a changed rating) is recorded, one that was turned off is removed. "Read" is
 * implied by a rating or like, so it isn't recorded alongside them. Pass `removalsOnly` when
 * something else (a diary entry) already stands for the change.
 */
export async function syncShelfActivity(
  db: Database,
  actorId: string,
  workId: number,
  before: ShelfState,
  after: ShelfState,
  { removalsOnly = false } = {},
) {
  const object = { type: "work", id: workId } as const;
  const gained = new Set<ActivityVerb>();
  for (const [key, verb] of SHELF_VERBS) {
    const on = Boolean(after[key]);
    if (!on && before[key]) await removeActivity(db, actorId, verb, object);
    if (on && after[key] !== before[key]) gained.add(verb);
  }
  if (removalsOnly) return;
  if (gained.has("rated") || gained.has("liked_work")) gained.delete("read");
  for (const verb of gained) await recordActivity(db, actorId, verb, object, workId);
}
