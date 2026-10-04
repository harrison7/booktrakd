import { requireEnv } from "./env";
import { createDb, seedGenres } from "./index";

const { db, client } = createDb(requireEnv("DATABASE_URL"), { max: 1 });
await seedGenres(db);
await client.end();
console.log("Seeded genres.");
