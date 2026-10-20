import { toNextJsHandler } from "better-auth/next-js";
import { services } from "@/server/services";

// Built per request so importing this route (e.g. during `next build`) doesn't create auth.
export const GET = (req: Request) => toNextJsHandler(services.auth).GET(req);
export const POST = (req: Request) => toNextJsHandler(services.auth).POST(req);
