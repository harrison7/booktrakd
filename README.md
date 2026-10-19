# booktrakd

A Letterboxd-style site and app for books. See [PLAN.md](PLAN.md) for the full product and technical plan.

## Repo layout

```
apps/web/            Next.js website (also hosts the tRPC API)
apps/worker/         Catalog import CLI + background jobs (cover caching)
packages/api/        tRPC routers — all business logic
packages/catalog/    Title/author/ISBN normalization shared by importers
packages/db/         Drizzle schema, migrations, seed
packages/auth/       Better Auth config (shared by web + mobile)
packages/validators/ Shared Zod schemas
packages/ui-tokens/  Colors, fonts, cover sizes
```

`apps/mobile` (Expo) arrives in Phase 4.

## Setup

Requires Node 22+, pnpm 10+, and Docker (for Postgres + Meilisearch).

```sh
pnpm install
cp .env.example .env          # then fill in BETTER_AUTH_SECRET etc.
docker compose up -d          # Postgres on :5433, Meilisearch on :7700
pnpm db:migrate
pnpm db:seed                  # genre list
```

## Importing the book catalog

The catalog is built from the [Open Library data dumps](https://openlibrary.org/developers/dumps) (CC0).

**For development, import a sample.** It takes the most popular books, streams the dumps
straight from Open Library (nothing large is saved), and needs only ~1–2 GB of disk:

```sh
pnpm cli import sample --top 50000   # ~1 hour, mostly streaming the editions dump
```

The full catalog (~5 million books) needs about 60 GB free and is meant for the server:

```sh
pnpm cli import download      # ~15 GB of .gz files into .data/ (resumable per file)
pnpm cli import load          # parse + filter into staging tables
pnpm cli import build         # staging → works/editions/authors, dedupe, popularity, covers, slugs
pnpm cli import index         # push to Meilisearch
# or all four at once:
pnpm cli import all
```

Fix-up commands (no dump reload needed):

```sh
pnpm cli import genres          # re-derive genres after changing the mapping rules
pnpm cli import author-names    # authors stored under a non-Latin name → Latin name (OL API)
```

The build refuses to run if the staging tables are empty. They're UNLOGGED for speed, so
Postgres clears them after an unclean shutdown; re-run `import load` / `import sample`.

Use `--only works,editions` with `download`/`load` to work on specific dumps. Running the
build again with newer dumps only adds new records and refreshes derived fields, so librarian
edits are never overwritten.

Covers are fetched from Open Library on demand, resized (46–460px WebP), and stored on
Cloudflare R2, or in `.data/images/` when `R2_*` isn't set:

```sh
pnpm cli covers prefetch --top 50000   # queue the most popular works' covers
pnpm cli worker                        # process the queue (leave running)
```

Please set `OL_USER_AGENT` in `.env` to your app name and contact email, as Open Library asks.

## Running the website

```sh
pnpm dev                        # http://localhost:3000
pnpm cli worker                 # optional: caches covers locally as they're viewed
```

Readers can import their Goodreads or StoryGraph history at **Settings → Import**, and export
their library and diary as CSV from the same page.

## Checks

```sh
pnpm lint        # Biome
pnpm typecheck
pnpm test        # Vitest; database tests use in-memory PGlite, so no Docker needed
```

After changing the schema in `packages/db/src/schema`, run `pnpm db:generate` to create a migration.
