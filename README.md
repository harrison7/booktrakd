# booktrakd

A Letterboxd-style site and app for books. See [PLAN.md](PLAN.md) for the full product and technical plan.

## Repo layout

```
apps/worker/         Catalog import CLI + background jobs (cover caching)
packages/db/         Drizzle schema, migrations, seed
packages/auth/       Better Auth config (shared by web + mobile)
packages/validators/ Shared Zod schemas
packages/ui-tokens/  Colors, fonts, cover sizes
```

`apps/web` (Next.js) and `apps/mobile` (Expo) arrive in Phases 1 and 4.

## Setup

Requires Node 22+, pnpm 10+, and Docker (for Postgres + Meilisearch).

```sh
pnpm install
cp .env.example .env          # then fill in BETTER_AUTH_SECRET etc.
docker compose up -d          # Postgres on :5432, Meilisearch on :7700
pnpm db:migrate
pnpm db:seed                  # genre list
```

## Importing the book catalog

The catalog is built from the [Open Library data dumps](https://openlibrary.org/developers/dumps) (CC0).

```sh
pnpm cli import download      # ~15 GB of .gz files into .data/ (resumable per file)
pnpm cli import load          # parse + filter into staging tables
pnpm cli import build         # staging → works/editions/authors, dedupe, popularity, covers, slugs
pnpm cli import index         # push to Meilisearch
# or all four at once:
pnpm cli import all
```

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

## Checks

```sh
pnpm lint        # Biome
pnpm typecheck
pnpm test        # Vitest; database tests use in-memory PGlite, so no Docker needed
```

After changing the schema in `packages/db/src/schema`, run `pnpm db:generate` to create a migration.
