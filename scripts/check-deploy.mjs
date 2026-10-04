import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--env" || args[1] !== "qa")) {
  throw new Error("Допустимы только основное окружение без аргументов или --env qa.");
}

const qa = args.length > 0;
const config = JSON.parse(await readFile("wrangler.json", "utf8"));
const target = qa ? config.env?.qa : config;
const expectedWorker = qa ? "civilist-qa" : "civilist";
const expectedDatabase = qa ? "civilist-db-qa" : "civilist-db";

if (target?.name !== expectedWorker) {
  throw new Error(`Для этого окружения ожидается Worker ${expectedWorker}.`);
}
const bindings = target.d1_databases?.filter(database => database.binding === "DB") ?? [];
if (bindings.length !== 1 || bindings[0].database_name !== expectedDatabase) {
  throw new Error(`Настрой одну привязку DB к базе ${expectedDatabase}.`);
}
const database = bindings[0];
const placeholder = "00000000-0000-4000-8000-000000000000";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(database.database_id ?? "") || database.database_id === placeholder) {
  throw new Error(`Укажи настоящий database_id для ${expectedDatabase}. См. docs/DEPLOY.md и docs/QA.md.`);
}
if (qa) {
  const productionIds = config.d1_databases?.map(binding => binding.database_id?.toLowerCase()) ?? [];
  if (productionIds.includes(database.database_id.toLowerCase())) {
    throw new Error("QA должна использовать отдельную базу: её database_id совпадает с основной.");
  }
}
console.log(`Окружение: ${qa ? "QA" : "основное"}. Worker: ${expectedWorker}. База: ${expectedDatabase}.`);
