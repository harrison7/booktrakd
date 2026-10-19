import "server-only";
import { cache } from "react";
import { orNotFound, serverApi } from "@/server/api";

/** Shared by the profile layout and its pages (deduplicated per request). */
export const getProfile = cache(async (username: string) =>
  orNotFound((await serverApi()).users.profile({ username })),
);
