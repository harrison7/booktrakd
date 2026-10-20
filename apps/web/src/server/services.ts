// Long-lived server singletons. Cached on globalThis so dev hot-reloads don't open new
// database pools each time.
import "server-only";
import type { ApiDeps } from "@booktrakd/api";
import { createAuth } from "@booktrakd/auth";
import { COVER_QUEUE, type CoverJob, createDb } from "@booktrakd/db";
import { Meilisearch } from "meilisearch";
import { PgBoss } from "pg-boss";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

function optionalPair(id: string, secret: string) {
  const clientId = process.env[id];
  const clientSecret = process.env[secret];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

function createServices(): ApiDeps {
  // On Vercel each function instance gets its own pool, and DATABASE_URL points at a
  // connection pooler (Neon's PgBouncer): keep pools small and skip prepared statements.
  const { db } = createDb(
    required("DATABASE_URL"),
    process.env.VERCEL ? { max: 2, prepare: false } : {},
  );
  const auth = createAuth({
    db,
    secret: required("BETTER_AUTH_SECRET"),
    baseURL: required("BETTER_AUTH_URL"),
    google: optionalPair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    apple: optionalPair("APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"),
  });
  const search = process.env.MEILI_URL
    ? new Meilisearch({ host: process.env.MEILI_URL, apiKey: process.env.MEILI_MASTER_KEY })
    : null;

  // The web app only enqueues jobs; the worker owns pg-boss's schema and maintenance.
  let boss: Promise<PgBoss | null> | undefined;
  const getBoss = () => {
    boss ??= (async () => {
      const instance = new PgBoss({
        connectionString: required("DATABASE_URL"),
        supervise: false,
        schedule: false,
        migrate: false,
        createSchema: false,
      });
      instance.on("error", (error) => console.error("pg-boss:", error.message));
      try {
        await instance.start();
        return instance;
      } catch (error) {
        console.warn("Cover queue unavailable (is `pnpm cli worker` set up?):", error);
        return null;
      }
    })();
    return boss;
  };

  return {
    db,
    auth,
    search,
    enqueueCover: async (coverId) => {
      const queue = await getBoss();
      // singletonKey + singletonSeconds: at most one queued fetch per cover per hour.
      await queue
        ?.send(COVER_QUEUE, { coverId } satisfies CoverJob, {
          singletonKey: String(coverId),
          singletonSeconds: 3600,
        })
        .catch(() => {});
    },
  };
}

const globalForServices = globalThis as unknown as { booktrakdServices?: ApiDeps };
const get = () => {
  globalForServices.booktrakdServices ??= createServices();
  return globalForServices.booktrakdServices;
};

/**
 * Created on first use rather than at import, so `next build` (which imports routes to
 * collect page data) doesn't need DATABASE_URL and the auth secrets.
 */
export const services: ApiDeps = {
  get db() {
    return get().db;
  },
  get auth() {
    return get().auth;
  },
  get search() {
    return get().search;
  },
  enqueueCover: (coverId) => get().enqueueCover(coverId),
};
