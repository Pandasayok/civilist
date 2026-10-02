import {readFile} from "node:fs/promises";
const config=JSON.parse(await readFile("wrangler.json","utf8"));
if(config.d1_databases[0].database_id==="00000000-0000-4000-8000-000000000000")throw new Error("Сначала создай civilist-db и выполни npm run db:configure -- DATABASE_ID. См. docs/DEPLOY.md.");
