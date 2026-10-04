import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { requireEnv } from "./env";
import { createDb } from "./index";

const { db, client } = createDb(requireEnv("DATABASE_URL"), { max: 1 });
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await client.end();
console.log("Migrations applied.");
