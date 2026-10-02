import {readFile,writeFile} from "node:fs/promises";
const id=process.argv[2];
if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||id==="00000000-0000-4000-8000-000000000000")throw new Error("Передай database_id, полученный после создания D1: npm run db:configure -- UUID");
const config=JSON.parse(await readFile("wrangler.json","utf8"));
config.d1_databases[0].database_id=id;
await writeFile("wrangler.json",JSON.stringify(config,null,2)+"\n");
console.log("D1 настроена. database_id — идентификатор, его можно сохранить в Git; он не даёт доступа к данным.");
