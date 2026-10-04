import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get dataDir() {
    return path.resolve(REPO_ROOT, process.env.DATA_DIR || ".data");
  },
  get olUserAgent() {
    return process.env.OL_USER_AGENT || "booktrakd/0.1 (development)";
  },
  get meili() {
    const host = process.env.MEILI_URL;
    return host ? { host, apiKey: process.env.MEILI_MASTER_KEY } : null;
  },
  get r2() {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
    return {
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    };
  },
};
