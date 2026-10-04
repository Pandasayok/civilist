import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../wrangler.json", import.meta.url), "utf8"));
const checkScript = fileURLToPath(new URL("../scripts/check-deploy.mjs", import.meta.url));
const accessScript = fileURLToPath(new URL("../scripts/create-access.mjs", import.meta.url));

function inTemporaryDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "civilist-deployment-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined);
  return result;
}

test("deployment preflight selects the correct Worker and database for production and QA", () => {
  inTemporaryDirectory(directory => {
    writeFileSync(join(directory, "wrangler.json"), JSON.stringify(config));
    for (const [args, worker, database] of [
      [[], "civilist", "civilist-db"],
      [["--env", "qa"], "civilist-qa", "civilist-db-qa"],
    ]) {
      const result = run(checkScript, args, directory);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(`Worker: ${worker}. База: ${database}.`));
    }
  });
});

const invalidConfigurations = [
  ["QA points to the production database", value => { value.env.qa.d1_databases[0].database_id = value.d1_databases[0].database_id.toUpperCase(); }],
  ["QA uses the production Worker name", value => { value.env.qa.name = value.name; }],
  ["QA uses the production database name", value => { value.env.qa.d1_databases[0].database_name = "civilist-db"; }],
  ["QA is missing its DB binding", value => { delete value.env.qa.d1_databases; }],
  ["QA has two DB bindings", value => { value.env.qa.d1_databases.push({ ...value.env.qa.d1_databases[0] }); }],
  ["QA has a placeholder database ID", value => { value.env.qa.d1_databases[0].database_id = "00000000-0000-4000-8000-000000000000"; }],
  ["QA has a malformed database ID", value => { value.env.qa.d1_databases[0].database_id = "invalid"; }],
];

for (const [description, mutate] of invalidConfigurations) {
  test(`deployment refuses when ${description}`, () => {
    inTemporaryDirectory(directory => {
      const changed = structuredClone(config);
      mutate(changed);
      writeFileSync(join(directory, "wrangler.json"), JSON.stringify(changed));
      assert.notEqual(run(checkScript, ["--env", "qa"], directory).status, 0);
    });
  });
}

test("deployment refuses unknown environment arguments", () => {
  inTemporaryDirectory(directory => {
    writeFileSync(join(directory, "wrangler.json"), JSON.stringify(config));
    assert.notEqual(run(checkScript, ["--env", "qaa"], directory).status, 0);
    assert.notEqual(run(checkScript, ["--env"], directory).status, 0);
  });
});

test("QA access credentials coexist with production credentials and contain matching code hashes", () => {
  inTemporaryDirectory(directory => {
    writeFileSync(join(directory, ".civilist-secrets.json"), "production secrets fixture");
    writeFileSync(join(directory, ".civilist-access.txt"), "production access fixture");
    const result = run(accessScript, ["--qa"], directory);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(directory, ".civilist-secrets.json"), "utf8"), "production secrets fixture");
    assert.equal(readFileSync(join(directory, ".civilist-access.txt"), "utf8"), "production access fixture");

    const secrets = JSON.parse(readFileSync(join(directory, ".civilist-secrets-qa.json"), "utf8"));
    const accounts = JSON.parse(secrets.CIVILIST_ACCOUNTS);
    const codes = readFileSync(join(directory, ".civilist-access-qa.txt"), "utf8").trim().split("\n").map(line => line.split(": ")[1]);
    assert.deepEqual(accounts.map(account => account.role), ["admin", "learner"]);
    assert.equal(codes.length, 2);
    for (let index = 0; index < accounts.length; index++) {
      assert.equal(accounts[index].codeHash, createHash("sha256").update(codes[index]).digest("hex"));
      assert.equal(secrets.CIVILIST_ACCOUNTS.includes(codes[index]), false);
    }
    assert.ok(secrets.CIVILIST_SESSION_SECRET.length >= 64);
    assert.ok(secrets.CIVILIST_EDITORIAL_TOKEN.length >= 40);
    assert.equal(result.stdout.includes(codes[0]), false);
  });
});

test("access generation refuses existing files before writing either file", () => {
  inTemporaryDirectory(directory => {
    writeFileSync(join(directory, ".civilist-access-qa.txt"), "existing QA access fixture");
    assert.notEqual(run(accessScript, ["--qa"], directory).status, 0);
    assert.deepEqual(readdirSync(directory), [".civilist-access-qa.txt"]);
    assert.equal(readFileSync(join(directory, ".civilist-access-qa.txt"), "utf8"), "existing QA access fixture");
  });
});

test("access generation refuses ambiguous or misspelled modes", () => {
  inTemporaryDirectory(directory => {
    for (const args of [["--qa", "--local"], ["--qaa"]]) {
      assert.notEqual(run(accessScript, args, directory).status, 0);
    }
    assert.deepEqual(readdirSync(directory), []);
  });
});
