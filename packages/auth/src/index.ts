// Better Auth server config, shared by the web app (which mounts the HTTP handler in
// Phase 1) and anything else that needs to read sessions.
import { expo } from "@better-auth/expo";
import type { Database } from "@booktrakd/db";
import { accounts, sessions, users, verifications } from "@booktrakd/db/schema";
import { username as usernameSchema } from "@booktrakd/validators";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

export interface AuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string };
}

export function createAuth({ db, secret, baseURL, google, apple }: AuthOptions) {
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...(google && { google }),
      // Apple sign-in is required on iOS whenever another social login is offered.
      ...(apple && { apple }),
    },
    user: {
      additionalFields: {
        bio: { type: "string", required: false },
        location: { type: "string", required: false },
        website: { type: "string", required: false },
        role: { type: "string", required: false, defaultValue: "user", input: false },
        isPatron: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    plugins: [
      username({
        minUsernameLength: 2,
        maxUsernameLength: 30,
        // Same rules as the sign-up form, including reserved names like "search" or "book"
        // that would collide with site routes (profiles live at /<username>).
        usernameValidator: (name) => usernameSchema.safeParse(name).success,
      }),
      expo(),
    ],
    trustedOrigins: ["booktrakd://"],
  });
}

export type Auth = ReturnType<typeof createAuth>;
