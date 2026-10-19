// Background job names and payloads, shared by the web app (which enqueues) and the
// worker (which processes).

export const COVER_QUEUE = "cover.cache";

export interface CoverJob {
  coverId: number;
}
