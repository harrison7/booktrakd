import { toNextJsHandler } from "better-auth/next-js";
import { services } from "@/server/services";

export const { GET, POST } = toNextJsHandler(services.auth);
