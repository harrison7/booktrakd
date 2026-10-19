import type { Auth } from "@booktrakd/auth";
import type { Database } from "@booktrakd/db";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Meilisearch } from "meilisearch";
import superjson from "superjson";
import { ZodError } from "zod";

/** Long-lived services the API needs, created once by the host app (web server). */
export interface ApiDeps {
  db: Database;
  auth: Auth;
  /** Null when Meilisearch isn't configured; search then falls back to Postgres. */
  search: Meilisearch | null;
  /** Queues a cover to be fetched and cached (no-op when the job queue isn't available). */
  enqueueCover: (coverId: number) => Promise<void>;
}

export interface SessionUser {
  id: string;
  username: string | null;
  name: string;
  role: string;
}

export async function createContext(deps: ApiDeps, opts: { headers: Headers }) {
  const session = await deps.auth.api.getSession({ headers: opts.headers });
  const user: SessionUser | null = session
    ? {
        id: session.user.id,
        username: session.user.username ?? null,
        name: session.user.name,
        role: (session.user as { role?: string }).role ?? "user",
      }
    : null;
  return { ...deps, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
    },
  }),
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to do that" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
