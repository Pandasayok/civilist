import { randomBytes, createHash } from "node:crypto";
import { access, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => !["--local", "--qa"].includes(arg))) {
  throw new Error("Выбери один режим: без аргументов, --local или --qa.");
}
const local = args.includes("--local");
const qa = args.includes("--qa");
const secretsPath = local ? ".dev.vars" : qa ? ".civilist-secrets-qa.json" : ".civilist-secrets.json";
const accessPath = local ? ".civilist-access-local.txt" : qa ? ".civilist-access-qa.txt" : ".civilist-access.txt";

for (const path of [secretsPath, accessPath]) {
  let exists = true;
  try {
    await access(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    exists = false;
  }
  if (exists) throw new Error(`Файл ${path} уже существует. Существующие коды не перезаписаны.`);
}

const definitions = [{ id: "owner", name: "Дмитрий", role: "admin" }, { id: "sofia", name: "Софья", role: "learner" }];
const issued = definitions.map(account => ({ ...account, code: randomBytes(24).toString("base64url") }));
const accounts = issued.map(({ code, ...account }) => ({ ...account, codeHash: createHash("sha256").update(code).digest("hex") }));
const secrets = {
  CIVILIST_ACCOUNTS: JSON.stringify(accounts),
  CIVILIST_SESSION_SECRET: randomBytes(48).toString("base64url"),
  CIVILIST_EDITORIAL_TOKEN: randomBytes(32).toString("base64url"),
};
const contents = local
  ? Object.entries(secrets).map(([name, value]) => `${name}='${value}'`).join("\n") + "\n"
  : JSON.stringify(secrets, null, 2) + "\n";
await writeFile(secretsPath, contents, { flag: "wx", mode: 0o600 });
await writeFile(accessPath, issued.map(({ name, role, code }) => `${name} (${role}): ${code}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
console.log(`Созданы ${secretsPath} и ${accessPath} для ${local ? "локальной проверки" : qa ? "QA" : "основного сайта"}.`);
console.log("Сохрани коды в менеджере паролей. Эти файлы исключены из Git. Повторный запуск не перезаписывает их.");
