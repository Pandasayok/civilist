import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Create civilist-db and configure the DB binding in wrangler.json."
    );
  }

  return drizzle(env.DB, { schema });
}
