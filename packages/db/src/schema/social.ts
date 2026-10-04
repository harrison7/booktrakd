import { index, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { works } from "./catalog";
import { createdAt, id, ref, updatedAt } from "./helpers";

const userRef = (name: string) =>
  text(name)
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const follows = pgTable(
  "follows",
  {
    followerId: userRef("follower_id"),
    followeeId: userRef("followee_id"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follows_followee_idx").on(t.followeeId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: userRef("blocker_id"),
    blockedId: userRef("blocked_id"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const likeTarget = pgEnum("like_target", ["entry", "list", "comment"]);

export const likes = pgTable(
  "likes",
  {
    userId: userRef("user_id"),
    targetType: likeTarget("target_type").notNull(),
    targetId: ref("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("likes_target_idx").on(t.targetType, t.targetId),
  ],
);

export const commentTarget = pgEnum("comment_target", ["entry", "list"]);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    userId: userRef("user_id"),
    targetType: commentTarget("target_type").notNull(),
    targetId: ref("target_id").notNull(),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

export const activityVerb = pgEnum("activity_verb", [
  "read",
  "rated",
  "liked_work",
  "logged",
  "reviewed",
  "added_to_reading_list",
  "started_reading",
  "created_list",
  "liked_entry",
  "liked_list",
  "followed",
]);

/** Source rows for the activity feed (fan-out on read). */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    actorId: userRef("actor_id"),
    verb: activityVerb("verb").notNull(),
    objectType: text("object_type", { enum: ["work", "entry", "list", "user"] }).notNull(),
    objectId: text("object_id").notNull(),
    // The book involved, if any — lets the feed render covers without extra joins.
    workId: ref("work_id").references(() => works.id),
    createdAt: createdAt(),
  },
  (t) => [index("activities_actor_idx").on(t.actorId, t.createdAt.desc())],
);

export const notificationType = pgEnum("notification_type", [
  "new_follower",
  "entry_liked",
  "list_liked",
  "comment_liked",
  "entry_commented",
  "list_commented",
  "comment_replied",
  "import_finished",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: userRef("user_id"),
    type: notificationType("type").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "cascade" }),
    objectType: text("object_type", { enum: ["entry", "list", "comment", "user", "import"] }),
    objectId: text("object_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt.desc())],
);
