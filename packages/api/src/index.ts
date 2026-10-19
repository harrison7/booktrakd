import { catalogRouter } from "./routers/catalog";
import { entriesRouter } from "./routers/entries";
import { importsRouter } from "./routers/imports";
import { reportsRouter } from "./routers/reports";
import { searchRouter } from "./routers/search";
import { shelfRouter } from "./routers/shelf";
import { usersRouter } from "./routers/users";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  catalog: catalogRouter,
  entries: entriesRouter,
  imports: importsRouter,
  reports: reportsRouter,
  search: searchRouter,
  shelf: shelfRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);

export type { BookCard, Cover } from "./lib/cards";
export { exportDiaryCsv, exportLibraryCsv } from "./lib/export";
export { applyShelfPatch, EMPTY_SHELF, type ShelfState } from "./lib/shelf";
export type { Review } from "./routers/entries";
export { type ApiDeps, type Context, createContext, type SessionUser } from "./trpc";
