import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

const sites = {
  qa: "https://civilist-qa.cybenkodmitrij92.workers.dev",
  production: "https://civilist.cybenkodmitrij92.workers.dev",
};
const args = process.argv.slice(2);
if (args.length !== 1 || !Object.hasOwn(sites, args[0])) throw new Error("Выбери qa или production.");
const base = sites[args[0]];
let lastError;
for (let attempt = 0; attempt < 10; attempt++) {
  try {
    const page = await fetch(base + "/login", {redirect: "error", signal: AbortSignal.timeout(10_000)});
    assert.equal(page.status, 200, "Страница входа должна открываться.");
    assert.match(await page.text(), /<html[^>]*lang="ru"/);
    const api = await fetch(base + "/api/bootstrap", {redirect: "error", signal: AbortSignal.timeout(10_000)});
    assert.equal(api.status, 401, "API должен оставаться закрытым без сессии.");
    assert.equal((await api.json()).error, "Войди, чтобы открыть приложение.");
    console.log(`Проверены страница входа и закрытый API: ${base}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 9) await delay(1_000);
  }
}
throw lastError;
