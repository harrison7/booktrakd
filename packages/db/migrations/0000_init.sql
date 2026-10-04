CREATE TYPE "public"."book_format" AS ENUM('hardcover', 'paperback', 'ebook', 'audiobook', 'other');--> statement-breakpoint
CREATE TYPE "public"."contributor_role" AS ENUM('author', 'editor', 'illustrator', 'translator', 'narrator', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."cover_source" AS ENUM('openlibrary', 'google_books', 'hardcover', 'upload');--> statement-breakpoint
CREATE TYPE "public"."cover_status" AS ENUM('pending', 'ready', 'missing', 'failed');--> statement-breakpoint
CREATE TYPE "public"."list_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "public"."catalog_edit_action" AS ENUM('edit', 'merge', 'move_edition', 'set_cover', 'revert');--> statement-breakpoint
CREATE TYPE "public"."catalog_object" AS ENUM('work', 'edition', 'author', 'series', 'cover');--> statement-breakpoint
CREATE TYPE "public"."catalog_report_kind" AS ENUM('wrong_cover', 'duplicate', 'wrong_author', 'wrong_info', 'offensive', 'other', 'possible_duplicate');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('goodreads', 'storygraph', 'hardcover');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'running', 'needs_review', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."activity_verb" AS ENUM('read', 'rated', 'liked_work', 'logged', 'reviewed', 'added_to_reading_list', 'started_reading', 'created_list', 'liked_entry', 'liked_list', 'followed');--> statement-breakpoint
CREATE TYPE "public"."comment_target" AS ENUM('entry', 'list');--> statement-breakpoint
CREATE TYPE "public"."like_target" AS ENUM('entry', 'list', 'comment');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_follower', 'entry_liked', 'list_liked', 'comment_liked', 'entry_commented', 'list_commented', 'comment_replied', 'import_finished');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"bio" text,
	"location" text,
	"website" text,
	"role" text DEFAULT 'user' NOT NULL,
	"is_patron" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "authors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text,
	"name" text NOT NULL,
	"bio" text,
	"birth_date" text,
	"death_date" text,
	"ol_photo_id" integer,
	"merged_into_id" bigint,
	"ol_author_id" text,
	"wikidata_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug"),
	CONSTRAINT "authors_ol_author_id_unique" UNIQUE("ol_author_id")
);
--> statement-breakpoint
CREATE TABLE "covers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "covers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"work_id" bigint,
	"edition_id" bigint,
	"source" "cover_source" NOT NULL,
	"source_id" text NOT NULL,
	"status" "cover_status" DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"width" integer,
	"height" integer,
	"dominant_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "covers_source_unique" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "edition_contributors" (
	"edition_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"role" "contributor_role" NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "edition_contributors_edition_id_author_id_role_pk" PRIMARY KEY("edition_id","author_id","role")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "editions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"work_id" bigint NOT NULL,
	"title" text NOT NULL,
	"isbn10" text,
	"isbn13" text,
	"publisher" text,
	"publish_date" text,
	"publish_year" smallint,
	"format" "book_format",
	"page_count" integer,
	"language" text,
	"ol_cover_id" integer,
	"ol_edition_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_ol_edition_id_unique" UNIQUE("ol_edition_id")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "series_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "work_contributors" (
	"work_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"role" "contributor_role" DEFAULT 'author' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "work_contributors_work_id_author_id_role_pk" PRIMARY KEY("work_id","author_id","role")
);
--> statement-breakpoint
CREATE TABLE "work_genres" (
	"work_id" bigint NOT NULL,
	"genre_slug" text NOT NULL,
	CONSTRAINT "work_genres_work_id_genre_slug_pk" PRIMARY KEY("work_id","genre_slug")
);
--> statement-breakpoint
CREATE TABLE "work_stats" (
	"work_id" bigint PRIMARY KEY NOT NULL,
	"histogram" integer[] DEFAULT '{0,0,0,0,0,0,0,0,0,0}' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" real,
	"read_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"list_count" integer DEFAULT 0 NOT NULL,
	"reading_list_count" integer DEFAULT 0 NOT NULL,
	"weekly_activity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "works_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text,
	"title" text NOT NULL,
	"subtitle" text,
	"match_title" text NOT NULL,
	"description" text,
	"first_published_year" smallint,
	"language" text,
	"page_count" integer,
	"edition_count" integer DEFAULT 0 NOT NULL,
	"subjects" text[],
	"primary_cover_id" bigint,
	"series_id" bigint,
	"series_position" real,
	"popularity_score" real DEFAULT 0 NOT NULL,
	"merged_into_id" bigint,
	"ol_work_id" text,
	"hardcover_id" text,
	"wikidata_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_slug_unique" UNIQUE("slug"),
	CONSTRAINT "works_ol_work_id_unique" UNIQUE("ol_work_id")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"work_id" bigint NOT NULL,
	"edition_id" bigint,
	"format" "book_format",
	"started_on" date,
	"finished_on" date,
	"rating" smallint,
	"is_liked" boolean DEFAULT false NOT NULL,
	"is_reread" boolean DEFAULT false NOT NULL,
	"is_dnf" boolean DEFAULT false NOT NULL,
	"review_text" text,
	"contains_spoilers" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_rating_range" CHECK ("entries"."rating" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "entry_tags" (
	"entry_id" bigint NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "entry_tags_entry_id_tag_pk" PRIMARY KEY("entry_id","tag")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"position" smallint NOT NULL,
	"work_id" bigint NOT NULL,
	CONSTRAINT "favorites_user_id_position_pk" PRIMARY KEY("user_id","position"),
	CONSTRAINT "favorites_position_range" CHECK ("favorites"."position" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"list_id" bigint NOT NULL,
	"work_id" bigint NOT NULL,
	"position" double precision NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_list_id_work_id_pk" PRIMARY KEY("list_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "list_tags" (
	"list_id" bigint NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "list_tags_list_id_tag_pk" PRIMARY KEY("list_id","tag")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_ranked" boolean DEFAULT false NOT NULL,
	"visibility" "list_visibility" DEFAULT 'public' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "reading_goals" (
	"user_id" text NOT NULL,
	"year" smallint NOT NULL,
	"target" integer NOT NULL,
	CONSTRAINT "reading_goals_user_id_year_pk" PRIMARY KEY("user_id","year")
);
--> statement-breakpoint
CREATE TABLE "user_works" (
	"user_id" text NOT NULL,
	"work_id" bigint NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_liked" boolean DEFAULT false NOT NULL,
	"rating" smallint,
	"on_reading_list" boolean DEFAULT false NOT NULL,
	"reading_list_position" double precision,
	"reading_list_added_at" timestamp with time zone,
	"is_currently_reading" boolean DEFAULT false NOT NULL,
	"is_dnf" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_works_user_id_work_id_pk" PRIMARY KEY("user_id","work_id"),
	CONSTRAINT "user_works_rating_range" CHECK ("user_works"."rating" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "catalog_edits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "catalog_edits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"editor_id" text,
	"object_type" "catalog_object" NOT NULL,
	"object_id" bigint NOT NULL,
	"action" "catalog_edit_action" NOT NULL,
	"diff" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "catalog_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reporter_id" text,
	"object_type" "catalog_object" NOT NULL,
	"object_id" bigint NOT NULL,
	"kind" "catalog_report_kind" NOT NULL,
	"details" jsonb,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reporter_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "imports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"source" "import_source" NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"stats" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" text NOT NULL,
	"verb" "activity_verb" NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"work_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"target_type" "comment_target" NOT NULL,
	"target_id" bigint NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"user_id" text NOT NULL,
	"target_type" "like_target" NOT NULL,
	"target_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"actor_id" text,
	"object_type" text,
	"object_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_merged_into_id_authors_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "covers" ADD CONSTRAINT "covers_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "covers" ADD CONSTRAINT "covers_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_contributors" ADD CONSTRAINT "edition_contributors_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_contributors" ADD CONSTRAINT "edition_contributors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contributors" ADD CONSTRAINT "work_contributors_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contributors" ADD CONSTRAINT "work_contributors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_genre_slug_genres_slug_fk" FOREIGN KEY ("genre_slug") REFERENCES "public"."genres"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_stats" ADD CONSTRAINT "work_stats_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_primary_cover_id_covers_id_fk" FOREIGN KEY ("primary_cover_id") REFERENCES "public"."covers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_merged_into_id_works_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_tags" ADD CONSTRAINT "list_tags_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_works" ADD CONSTRAINT "user_works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_works" ADD CONSTRAINT "user_works_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_edits" ADD CONSTRAINT "catalog_edits_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "covers_work_idx" ON "covers" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "edition_contributors_author_idx" ON "edition_contributors" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "editions_work_idx" ON "editions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "editions_isbn13_idx" ON "editions" USING btree ("isbn13");--> statement-breakpoint
CREATE INDEX "work_contributors_author_idx" ON "work_contributors" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "work_genres_genre_idx" ON "work_genres" USING btree ("genre_slug");--> statement-breakpoint
CREATE INDEX "works_match_title_idx" ON "works" USING btree ("match_title");--> statement-breakpoint
CREATE INDEX "works_popularity_idx" ON "works" USING btree ("popularity_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "works_merged_into_idx" ON "works" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "works_series_idx" ON "works" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "entries_user_diary_idx" ON "entries" USING btree ("user_id","finished_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_work_idx" ON "entries" USING btree ("work_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_work_reviews_idx" ON "entries" USING btree ("work_id","like_count" DESC NULLS LAST) WHERE "entries"."review_text" is not null;--> statement-breakpoint
CREATE INDEX "entry_tags_tag_idx" ON "entry_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "list_items_order_idx" ON "list_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE INDEX "list_items_work_idx" ON "list_items" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "list_tags_tag_idx" ON "list_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "user_works_work_idx" ON "user_works" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "user_works_reading_list_idx" ON "user_works" USING btree ("user_id","reading_list_position") WHERE "user_works"."on_reading_list";--> statement-breakpoint
CREATE INDEX "catalog_edits_object_idx" ON "catalog_edits" USING btree ("object_type","object_id","created_at");--> statement-breakpoint
CREATE INDEX "catalog_reports_status_idx" ON "catalog_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "activities_actor_idx" ON "activities" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_target_idx" ON "comments" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "likes_target_idx" ON "likes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);