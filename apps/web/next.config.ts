import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// One .env for the whole monorepo, at the repo root.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@booktrakd/api",
    "@booktrakd/auth",
    "@booktrakd/db",
    "@booktrakd/ui-tokens",
    "@booktrakd/validators",
  ],
  serverExternalPackages: ["postgres", "pg-boss"],
  typedRoutes: true,
};

export default nextConfig;
