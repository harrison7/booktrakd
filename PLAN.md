# booktrakd — Project Plan

A social book-logging site and mobile app modeled on Letterboxd: track what you read, rate and review it, make lists, keep a reading list, and follow friends. The UI is simple, dark, and built around cover art.

---

## 1. Tech stack

TypeScript everywhere, so the web app, mobile app, and API share types, validation, and business logic in one monorepo.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | One language for web, mobile, API, and jobs |
| Monorepo | **pnpm workspaces + Turborepo** | Shared packages, cached builds |
| Web app | **Next.js (App Router) + React** | Server rendering makes book/author/list pages SEO-friendly; easy OG share images |
| Styling (web) | **Tailwind CSS** | Fast to build a consistent design system |
| Mobile app | **Expo (React Native) + Expo Router** | iOS + Android from one codebase, reuses the API client and types |
| Styling (mobile) | **NativeWind** | The same Tailwind tokens as web |
| API | **tRPC** (served from Next.js route handlers) | End-to-end typed API used by both web and mobile; no separate schema to maintain |
| Validation | **Zod** | Shared input validation (forms, API, imports) |
| Database | **PostgreSQL 16+** | Relational social data, `pg_trgm` and full-text search as backup |
| ORM | **Drizzle ORM** | Type-safe SQL, lightweight migrations |
| Search | **Meilisearch** | Typo-tolerant, fast title/author search with popularity ranking |
| Auth | **Better Auth** | Email/password + Google/Apple sign-in, works with Expo |
| Background jobs | **pg-boss** (Postgres-backed queue) | Cover caching, imports, stats, and feed jobs with no Redis needed |
| File storage | **Cloudflare R2 + Cloudflare CDN** | Cached covers and avatars; free egress |
| Image resizing | **sharp** (in worker) | Pre-generates cover sizes (see §6) |
| Payments (later) | **Stripe** | Patron/Pro subscription |
| Email | **Resend** | Verification, password reset, digests |
| Testing | **Vitest** (unit), **Playwright** (web e2e) | |
| Monitoring | **Sentry** (errors), **PostHog** or **Plausible** (analytics) | |
| CI/CD | **GitHub Actions** | Lint, typecheck, test, deploy |

### Hosting (start small, roughly $10–30/month)
- **Web/API:** Vercel. Note that the Hobby tier is non-commercial; move to Pro or self-host once you monetize.
- **Postgres + Meilisearch + worker:** a single Hetzner VPS (~€10–20/mo) running Docker Compose. Free managed Postgres tiers are too small for the book catalog.
- **Images:** Cloudflare R2 (10 GB free, no egress fees).
- **Local dev:** `docker-compose.yml` with Postgres and Meilisearch.

### Repo layout
```
booktrakd/
  apps/
    web/          Next.js site (also hosts the tRPC API)
    mobile/       Expo app
    worker/       pg-boss job runner + catalog import CLI
  packages/
    api/          tRPC routers — all business logic lives here
    db/           Drizzle schema, migrations, seed scripts
    auth/         Better Auth config (shared by web + mobile)
    validators/   Zod schemas
    ui-tokens/    Colors, spacing, type scale, cover sizes (shared by web + mobile)
  docker-compose.yml
  PLAN.md
```

---

## 2. Book data strategy

**booktrakd owns its own catalog.** External APIs are used only to seed and enrich it, so this catalog plays the role TMDB plays for Letterboxd.

- **Unit of everything = the *work*** (a book in the abstract), not the edition. Logs, ratings, reviews, lists, and reading lists all attach to works, so different editions never appear as duplicate entries.
- **Editions hang under works.** A user can optionally say which edition or format they read (hardcover, paperback, ebook, audiobook).

### Sources
| Source | Use |
|---|---|
| **Open Library data dumps** (CC0) | Primary seed: works, editions, authors. Also use OL's **ratings** and **reading-log** dumps as an initial popularity signal. |
| **Open Library API** | On-demand import when a user searches for something not yet in the catalog |
| **Open Library Covers** | Cover images. Fetch by cover ID (not ISBN, which is rate-limited), cache in R2, and credit Open Library. |
| **Hardcover API** *(optional, not required)* | A slow background job (well under the free limit of 5,000 requests/day) that cross-checks the most popular works for duplicates, series order, and covers. Credit Hardcover for any aggregate stats used. Re-read its API terms before launch, since the API is in beta. |
| **Google Books API** | Fallback covers and descriptions. Check its terms on caching and storage before saving data. |

### Import pipeline (worker CLI)
1. Download the OL works, editions, authors, ratings, and reading-log dumps (monthly).
2. **Filter** to keep only works with at least one edition that has an ISBN or a cover, plus any work with ratings or reading-log activity. This cuts ~40M records to a few million useful ones.
3. **Normalize:** clean titles (strip "(Penguin Classics)", edition notes), normalize author names, and map OL subjects onto a **controlled genre list** of about 30 genres (Fantasy, Sci-Fi, Literary Fiction, Mystery, Romance, History, …).
4. **Dedupe:** cluster works by normalized title + primary author. Auto-merge high-confidence clusters and send the rest to the librarian review queue.
5. **Compute** initial popularity from OL ratings and reading-log counts.
6. **Index** into Meilisearch: title, subtitle, authors, series, year, ISBNs, and popularity (used as the custom ranking rule).
7. **Prefetch covers** for the top ~50k works. Fetch everything else lazily on first view.

### Keeping data correct (the "community input" part)
- **Report an issue** button on every book and author page (wrong cover, duplicate, wrong author, etc.).
- **Librarian role** (trusted users) with edit forms, **merge works**, **move edition to another work**, and **choose primary cover**. Every change goes into an **edit history** with revert.
- Merged works keep a `merged_into_id` redirect, so old URLs and user data follow automatically.

---

## 3. Feature set (Letterboxd → booktrakd)

### 3.1 Core actions on a book
| Letterboxd | booktrakd | Notes |
|---|---|---|
| Watched (eye) | **Read** | Marking as read removes the book from the reading list |
| Like (heart) | **Like** | |
| Rating ½–5 stars | **Rating ½–5 stars** | Stored as an integer 1–10 |
| Watchlist | **Reading List** (TBR) | Ordered, with optional sort and shuffle |
| — | **Currently Reading** | Books-specific; shows on the profile |
| — | **Did Not Finish (DNF)** | Books-specific and frequently requested |
| Log / Diary entry | **Log** | Date finished (and optionally started), rating, like, review, **reread** flag, tags, edition/format read |
| Rewatch | **Reread** | |
| Review (with spoiler flag) | **Review** | Markdown-lite text, spoiler toggle, likes, comments |
| Add to lists | **Add to lists** | From the book page or the quick-action menu |
| Share | **Share** | Generated share image showing cover, rating, and review snippet |

### 3.2 Book page
- Large cover, title, subtitle, author(s) (linked), first-published year, page count, series and number, genres, description.
- **Action panel** (right sidebar on web, bottom sheet on mobile): Read / Like / Reading List / Currently Reading toggles, star rating, "Review or log…", "Add to lists…", Share.
- **Ratings histogram** (bar chart) with average and count.
- **Popular reviews**, **reviews from friends**, **your activity** with this book.
- **Lists featuring this book**, **similar books** (by co-occurrence in user lists and logs, falling back to genre and author).
- **Editions** tab: covers, formats, publishers, ISBNs.
- **Where to get it** (the counterpart of Letterboxd's "where to watch"): Bookshop.org (affiliate), Libby/WorldCat library links, Audible/Libro.fm for audiobooks.
- Tabs for **Members** (who read it), **Reviews**, **Lists**, **Likes**.

### 3.3 Diary and logging
- Chronological diary grouped by month, showing day, cover thumbnail, title, rating, like, reread, and review icons.
- Editing and deleting entries; multiple entries per book for rereads.
- Quick log on mobile: search or **scan the ISBN barcode** → log screen. This is a books-specific feature that gives the app a clear advantage.

### 3.4 Lists
- Ranked or unranked; title, description, tags, and a note on each entry.
- Public, unlisted, or private.
- Likes, comments, clone ("copy list").
- List views: cover grid (default) or detailed list.
- "You've read X of Y" progress bar on any list.

### 3.5 Profiles
- Header: avatar, display name, bio, location and website, follower and following counts, books read (all time and this year).
- **Favorite Four** (top-four covers).
- Recent activity, recent reviews, popular lists, ratings histogram, currently reading.
- Profile tabs: **Books** (read grid), **Diary**, **Reviews**, **Reading List**, **Lists**, **Likes**, **Tags**, **Network**, **Stats**.
- Per-user book page: `/{username}/book/{slug}` shows all of that user's activity on a book.

### 3.6 Social
- Asymmetric **follow** (like Letterboxd) and **block**.
- **Activity feed** of friends' logs, ratings, reviews, lists, and likes.
- **Likes** and **comments** on reviews and lists.
- **Notifications:** new follower, likes and comments on your content, replies. Web plus push on mobile.
- **Report** a review, comment, list, or user (moderation queue).

### 3.7 Discovery and browsing
- **Home (logged in):** "Popular with friends", "New from friends", popular reviews this week, popular lists.
- **Home (logged out):** hero cover collage, tagline, sign-up, popular books and reviews.
- **Browse books** with filters: popularity (this week / month / year / all time), highest rated, genre, decade and year, language, length (page count buckets), and a "hide books I've read" toggle.
- **Top 250** (highest weighted rating with a minimum rating count).
- **Author pages:** photo, bio, and a bibliography grid that overlays the viewer's read and rating state. Includes **contributor roles** (translator, illustrator, narrator), as Letterboxd does for cast and crew.
- **Series pages:** ordered covers with read-progress overlay.
- **Search:** books (title, author, ISBN), authors, series, lists, members.

### 3.8 Stats and goals
- **Profile stats:** books and pages read per year, rating distribution, top genres, top authors, most-read decades, format breakdown.
- **Year in Review** page (shareable).
- **Reading goal** for the year (books-specific), with progress shown on the profile.

### 3.9 Import / export
- **Goodreads CSV import** and **StoryGraph CSV import**, matched by ISBN, then by title + author, with a review screen for unmatched rows. This is critical for getting users to switch.
- **Hardcover import** once Hardcover ships OAuth. Its terms allow accessing user data on the user's behalf; don't ask users to paste personal API tokens.
- **Full CSV export** of the diary, ratings, reviews, lists, and reading list.

### 3.10 Monetization (later)
- **Patron/Pro subscription** (Stripe): no ads, advanced stats, **choose an alternate cover** for any book on your profile (Letterboxd lets Pro members pick alternate posters), custom profile header, early features.
- **Affiliate links** (Bookshop.org), which fit the "where to get it" panel.
- Optional tasteful ads for free users.

### Intentionally deferred or skipped
Editorial journal, publisher/brand pages (Letterboxd HQs), video content, reading-progress-by-page tracking (possible later), clubs/buddy reads (possible later).

---

## 4. Data model (PostgreSQL, simplified)

```
-- Catalog
works            id, slug, title, subtitle, description, first_published_year,
                 original_language, page_count (median of editions), primary_cover_id,
                 series_id, series_position, popularity_score, rating_avg, rating_count,
                 merged_into_id, ol_work_id, hardcover_id, wikidata_id, timestamps
editions         id, work_id, title, isbn10, isbn13, publisher, publish_date, format,
                 page_count, language, cover_id, ol_edition_id
authors          id, slug, name, bio, photo_key, birth_year, death_year, ol_author_id
work_contributors   work_id, author_id, role (author|editor|illustrator), position
edition_contributors edition_id, author_id, role (translator|narrator|illustrator)
series           id, slug, name, description
genres           id, slug, name                      -- controlled list
work_genres      work_id, genre_id
covers           id, work_id, edition_id, source, r2_key, width, height, dominant_color
work_stats       work_id, histogram int[10], read_count, like_count, list_count,
                 reading_list_count, weekly_activity

-- Users
users            id, username, display_name, bio, avatar_key, location, website,
                 is_patron, reading_goal, timestamps
follows          follower_id, followee_id, created_at
blocks           blocker_id, blocked_id
favorites        user_id, work_id, position (1–4)

-- Per-user state for a book (one row per user+work, like Letterboxd's film state)
user_works       user_id, work_id, is_read, is_liked, rating (1–10, nullable),
                 on_reading_list, reading_list_position, is_currently_reading, is_dnf,
                 updated_at

-- Diary entries; a "review" is an entry that has review text
entries          id, user_id, work_id, edition_id?, format?, started_on?, finished_on?,
                 rating?, is_liked, is_reread, review_text?, contains_spoilers,
                 like_count, comment_count, created_at, updated_at
entry_tags       entry_id, tag

-- Lists
lists            id, user_id, slug, title, description, is_ranked,
                 visibility (public|unlisted|private), like_count, comment_count
list_items       list_id, work_id, position, note

-- Social
likes            user_id, target_type (entry|list|comment), target_id, created_at
comments         id, user_id, target_type, target_id, body, created_at
activities       id, actor_id, verb, object_type, object_id, created_at   -- feed source
notifications    id, user_id, type, actor_id, object_type, object_id, read_at

-- Catalog quality and moderation
catalog_reports  id, reporter_id, object_type, object_id, kind, details, status
catalog_edits    id, editor_id, object_type, object_id, diff jsonb, created_at  -- revertible
content_reports  id, reporter_id, target_type, target_id, reason, status
imports          id, user_id, source (goodreads|storygraph), status, stats jsonb
```

Key rules:
- Logging an entry updates `user_works` (sets read, rating, like) and removes the book from the reading list.
- `work_stats` and `popularity_score` are recomputed by background jobs (hourly for "popular this week", nightly for everything else).
- The activity feed uses fan-out on read (query `activities` for the people you follow). That's fine to roughly 100k users; move to fan-out on write later if needed.

---

## 5. Pages and routes (web)

```
/                                  Home (feed when logged in, landing when logged out)
/search?q=                         Search
/books                             Browse (filters in query string)
/books/popular/this/week           Popular
/books/top-250                     Top rated
/books/genre/{genre}               Genre browse
/book/{slug}                       Book page
/book/{slug}/editions|reviews|lists|members|likes
/author/{slug}                     Author page
/series/{slug}                     Series page
/lists                             Popular lists
/members                           Popular members
/activity                          Your notifications and activity
/{username}                        Profile
/{username}/books|diary|reviews|reading-list|lists|likes|tags|following|followers|stats
/{username}/book/{slug}            A user's activity on one book
/{username}/review/{entry-id}      A single review/entry (with comments)
/{username}/list/{slug}            A single list
/{username}/year/{yyyy}            Year in Review
/settings, /settings/import, /settings/export, /settings/privacy
/librarian                         Report queue, merge tools, edit history (librarians only)
```

---

## 6. UI and design system

### Principles
1. **Covers are the interface.** Most pages are grids of covers; text stays secondary and quiet.
2. **Dark by default** (a light theme is optional later). Covers stand out against a dark slate background.
3. **One-tap actions.** Hovering (web) or long-pressing (mobile) a cover shows Read / Like / Reading List / Rate without leaving the page.
4. **Similar feel, own identity.** Use your own palette, logo, and name. Don't copy Letterboxd's logo, three-dot mark, or exact colors (trade-dress risk).

### Tokens (starting point)
| Token | Value | Use |
|---|---|---|
| `bg` | `#121417` | Page background |
| `surface` | `#1c2026` | Cards, panels |
| `border` | `#2c323a` | Dividers, cover outlines |
| `text` | `#e6e8eb` | Primary text |
| `text-muted` | `#8b949e` | Metadata |
| `accent-read` | teal `#2bb3a3` | Read state |
| `accent-like` | coral `#f2715a` | Like state |
| `accent-list` | indigo `#6c8cff` | Reading List state |
| `star` | amber `#f2b84b` | Ratings |

**Type:** a serif for titles and review text, since it suits books (e.g. *Source Serif 4* or *Fraunces*), plus *Inter* for UI. Both are free on Google Fonts.

### Covers
- Aspect ratio is fixed at **2:3**, with a thin 1px inner border and small corner radius, matching Letterboxd's poster treatment.
- Pre-generated sizes: **xs 46w** (diary rows), **sm 70w** (lists, feeds), **md 150w** (grids), **lg 230w** (book page), **xl 460w** (retina / share images). Serve WebP/AVIF.
- **Generated placeholder cover** when no art exists: a solid color derived from the title hash, with title and author set in the serif font. Many catalog works lack covers, so this needs to look good.
- Store a `dominant_color` per cover. It's used for the book page header and as a loading placeholder.

### Book page header
Letterboxd uses film backdrops; books have none. Instead, use a **heavily blurred, darkened enlargement of the cover** (or a gradient from `dominant_color`) as the page-top backdrop, fading into the background color.

### Key components
`Cover` (with sizes, hover actions, read-state overlay), `CoverGrid`, `StarRating` (half-star input and display), `ActionPanel`, `RatingHistogram`, `ReviewCard`, `DiaryRow`, `ListCard` (stacked-covers preview), `ProfileHeader`, `FavoriteFour`, `FeedItem`, `LogSheet` (modal on web, bottom sheet on mobile).

### Mobile app navigation
Bottom tabs: **Home** (feed and popular) · **Search** (with barcode scanner) · **＋ Log** · **Activity** · **Profile**. Covers use `expo-image` for caching. Haptics on rating and like.

---

## 7. API design (tRPC routers in `packages/api`)

| Router | Main procedures |
|---|---|
| `catalog` | `work.get`, `work.editions`, `work.similar`, `author.get`, `series.get`, `browse` (filters, sort, pagination) |
| `search` | `all`, `books`, `members`, `lists`, `byIsbn` |
| `shelf` | `setRead`, `setLiked`, `setRating`, `toggleReadingList`, `setCurrentlyReading`, `setDnf`, `getMyState` (batched for grids) |
| `entries` | `create`, `update`, `delete`, `get`, `diary`, `reviewsForWork`, `popularReviews` |
| `lists` | `create`, `update`, `delete`, `addItem`, `reorder`, `get`, `popular`, `forWork`, `clone` |
| `social` | `follow`, `unfollow`, `block`, `like`, `unlike`, `comment`, `feed`, `followers`, `following` |
| `users` | `profile`, `updateProfile`, `setFavorites`, `stats`, `yearInReview` |
| `notifications` | `list`, `markRead`, `registerPushToken` |
| `imports` | `start`, `status`, `resolveUnmatched`, `export` |
| `librarian` | `reports`, `editWork`, `mergeWorks`, `moveEdition`, `setPrimaryCover`, `history`, `revert` |

All mutations are rate-limited per user. Cursor-based pagination is used everywhere.

---

## 8. Roadmap

### Phase 0: Foundation (≈2–3 weeks)
- Monorepo scaffold, CI, Docker Compose (Postgres + Meilisearch), Drizzle schema, Better Auth.
- Open Library import pipeline: filter, normalize, dedupe pass, popularity, Meilisearch index.
- Cover caching worker (R2 + sharp sizes + dominant color) and placeholder covers.

### Phase 1: Web MVP (≈4–6 weeks)
- Design system and `Cover` component.
- Search, book page, author page.
- Read / Like / Rate / Reading List / Currently Reading / DNF.
- Log and diary, reviews (with spoilers).
- Profile with Favorite Four, read grid, diary, reviews, reading list.
- Goodreads and StoryGraph import; CSV export.
- "Report an issue" on catalog pages.
- **Launch to a small beta group.**

### Phase 2: Social (≈3–4 weeks)
- Follow and block, activity feed, likes, comments, notifications.
- Lists (full feature set).
- Content reporting and moderation queue.

### Phase 3: Discovery and catalog quality (≈3–4 weeks)
- Browse with filters, popular this week, Top 250, genre pages, series pages.
- Lists-on-book-page, similar books, friends' activity on book pages.
- Librarian tools: edit, merge, move edition, edit history and revert.
- OG share images for reviews, lists, and profiles.

### Phase 4: Mobile app (≈4–6 weeks)
- Expo app using the shared API client and tokens.
- All core flows, **ISBN barcode scanner**, push notifications.
- TestFlight / Play internal testing → store release.

### Phase 5: Stats and monetization
- Profile stats, Year in Review, reading goals.
- Patron tier (Stripe), alternate covers, Bookshop.org affiliate links.

---

## 9. Risks and open questions
- **Catalog quality** is the biggest product risk. Budget ongoing time for dedupe tooling and librarian recruitment.
- **API terms:** Hardcover's API docs reportedly have no anti-competition clause (not yet verified first-hand). The plan doesn't depend on Hardcover either way. Confirm Google Books' caching rules before storing its data.
- **Cover rights:** covers are publisher artwork. Displaying them to identify books is standard practice across book sites, but honor takedown requests and credit sources.
- **Name/trademark:** check that "booktrakd" (and its domain and app store names) are available and not confusingly similar to existing marks.
- **App store rules:** user-generated content requires report and block tools and a moderation process (covered in Phase 2), plus "Sign in with Apple" if Google sign-in is offered on iOS.
- **Scale:** Postgres + Meilisearch on one VPS comfortably serves the first tens of thousands of users. Split the database and worker onto separate machines when needed.
