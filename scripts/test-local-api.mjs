// A real Worker + D1, with disposable storage and credentials. No cloud access.
import {spawn} from "node:child_process";
import {access, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await access(join(root, "dist/index.html")).catch(() => {
  throw new Error("Сначала собери интерфейс: npm run build.");
});
const temporary = await mkdtemp(join(tmpdir(), "civilist-api-"));
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const configPath = join(temporary, "wrangler.json");
const storage = join(temporary, "state");
const childEnv = {...process.env, CI: "true", NO_COLOR: "1", WRANGLER_SEND_METRICS: "false"};
for (const key of Object.keys(childEnv)) {
  if (key.startsWith("CLOUDFLARE_") || key.startsWith("CIVILIST_") || key === "WRANGLER_ENV") delete childEnv[key];
}
let worker;
let workerClosed;
let output = "";
let stopping = false;

async function run(args, env = childEnv) {
  const child = spawn(process.execPath, args, {cwd: temporary, env, stdio: ["ignore", "inherit", "inherit"], timeout: 120_000});
  await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? accept() : reject(new Error(`Проверка остановлена: код ${code}, сигнал ${signal || "нет"}.`)));
  });
}

function signalWorker(signal) {
  if (!worker?.pid) return;
  try {
    if (process.platform === "win32") worker.kill(signal);
    else process.kill(-worker.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stopWorker() {
  if (!worker) return;
  signalWorker("SIGTERM");
  const closed = await Promise.race([workerClosed.then(() => true), delay(5_000).then(() => false)]);
  if (!closed) {
    signalWorker("SIGKILL");
    await workerClosed;
  }
}

const handleSignal = () => {
  stopping = true;
  signalWorker("SIGTERM");
};
process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

try {
  const original = JSON.parse(await readFile(join(root, "wrangler.json"), "utf8"));
  await writeFile(configPath, JSON.stringify({
    name: "civilist-ci",
    main: join(root, "worker/index.ts"),
    tsconfig: relative(temporary, join(root, "tsconfig.json")),
    compatibility_date: original.compatibility_date,
    compatibility_flags: original.compatibility_flags,
    assets: {...original.assets, directory: join(root, "dist")},
    d1_databases: [{binding: "DB", database_name: "civilist-ci", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: join(root, "drizzle")}],
  }));
  await run([join(root, "scripts/create-access.mjs"), "--local"]);
  await run([wrangler, "d1", "migrations", "apply", "DB", "--local", "--env=", "--config", configPath, "--persist-to", storage]);

  worker = spawn(process.execPath, [wrangler, "dev", "--local", "--env=", "--config", configPath, "--persist-to", storage, "--ip", "127.0.0.1", "--port", "0", "--inspector-port", "0"], {
    cwd: temporary, env: childEnv, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  let ended = false;
  let startupError;
  workerClosed = new Promise(accept => worker.once("close", () => {ended = true; accept();}));
  worker.once("error", error => {startupError = error;});
  const capture = chunk => {output = (output + chunk.toString()).slice(-24_000);};
  worker.stdout.on("data", capture);
  worker.stderr.on("data", capture);
  let base;
  const deadline = Date.now() + 60_000;
  while (!base && Date.now() < deadline) {
    if (stopping || ended || startupError) throw startupError || new Error("Локальный Worker остановился до запуска тестов.");
    const match = output.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      const response = await fetch(match[1] + "/api/bootstrap", {signal: AbortSignal.timeout(2_000)}).catch(() => null);
      if (response?.status === 401) base = match[1];
    }
    if (!base) await delay(100);
  }
  if (!base) throw new Error("Worker не запустился за 60 секунд.");
  await run([join(root, "tests/smoke.mjs")], {...childEnv, CIVILIST_TEST_BASE_URL: base, CIVILIST_TEST_CREDENTIALS_DIR: temporary});
} catch (error) {
  // Wrangler's normal logs redact secret values; credentials and storage are never artifacts.
  if (output) process.stderr.write(output);
  throw error;
} finally {
  await stopWorker();
  await rm(temporary, {recursive: true, force: true});
  process.removeListener("SIGINT", handleSignal);
  process.removeListener("SIGTERM", handleSignal);
}
