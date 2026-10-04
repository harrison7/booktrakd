// Catalog quality (reports, librarian edit history) and content moderation.
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, ref } from "./helpers";

export const catalogObject = pgEnum("catalog_object", [
  "work",
  "edition",
  "author",
  "series",
  "cover",
]);

export const catalogReportKind = pgEnum("catalog_report_kind", [
  "wrong_cover",
  "duplicate",
  "wrong_author",
  "wrong_info",
  "offensive",
  "other",
  // Raised by the importer when a likely duplicate was too ambiguous to auto-merge.
  "possible_duplicate",
]);

export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

export const catalogReports = pgTable(
  "catalog_reports",
  {
    id: id(),
    reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }), // null = system
    objectType: catalogObject("object_type").notNull(),
    objectId: ref("object_id").notNull(),
    kind: catalogReportKind("kind").notNull(),
    details: jsonb("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("catalog_reports_status_idx").on(t.status, t.createdAt)],
);

export const catalogEditAction = pgEnum("catalog_edit_action", [
  "edit",
  "merge",
  "move_edition",
  "set_cover",
  "revert",
]);

/** Revertible history of every catalog change (librarian or automated). */
export const catalogEdits = pgTable(
  "catalog_edits",
  {
    id: id(),
    editorId: text("editor_id").references(() => users.id, { onDelete: "set null" }), // null = system
    objectType: catalogObject("object_type").notNull(),
    objectId: ref("object_id").notNull(),
    action: catalogEditAction("action").notNull(),
    diff: jsonb("diff").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("catalog_edits_object_idx").on(t.objectType, t.objectId, t.createdAt)],
);

export const contentReports = pgTable(
  "content_reports",
  {
    id: id(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["entry", "list", "comment", "user"] }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason", {
      enum: ["spam", "harassment", "spoilers", "hate", "sexual", "other"],
    }).notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("content_reports_status_idx").on(t.status, t.createdAt)],
);

export const importSource = pgEnum("import_source", ["goodreads", "storygraph", "hardcover"]);
export const importStatus = pgEnum("import_status", [
  "pending",
  "running",
  "needs_review",
  "done",
  "failed",
]);

/** User library imports (Goodreads / StoryGraph CSV, Hardcover). */
export const imports = pgTable("imports", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: importSource("source").notNull(),
  status: importStatus("status").notNull().default("pending"),
  stats: jsonb("stats"),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
