// Calls the tRPC API directly from Server Components (no HTTP round trip).
import "server-only";
import { createCaller, createContext } from "@booktrakd/api";
import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { services } from "./services";

/** Per-request API caller, authenticated as the visitor. */
export const serverApi = cache(async () =>
  createCaller(await createContext(services, { headers: await headers() })),
);

/** Awaits an API call, turning NOT_FOUND into the 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
