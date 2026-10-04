import { bigint, timestamp } from "drizzle-orm/pg-core";

/** Auto-incrementing bigint primary key used by catalog and content tables. */
export const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

/** Bigint foreign-key column referencing an `id()` column. */
export const ref = (name: string) => bigint(name, { mode: "number" });

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
