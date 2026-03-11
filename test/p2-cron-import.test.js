import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-cron-"));
}

function runCli(args) {
  const dataDir = makeTempDir();
  const result = spawnSync("node", ["./bin/run.js", ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
      RRULENET_DATA_DIR: dataDir,
    },
  });

  return {
    ...result,
    dataDir,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("import cron converts a weekly cron expression to rrule", () => {
  const result = runCli(["import", "cron", "0 9 * * 1", "--timezone", "Europe/Paris", "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rrule, "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
  assert.equal(payload.timezone, "Europe/Paris");
  assert.equal(typeof payload.dtstart, "string");

  rmSync(result.dataDir, { recursive: true, force: true });
});

test("import cron supports last-day monthly patterns", () => {
  const result = runCli(["import", "cron", "0 0 L * *", "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rrule, "FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=0;BYMINUTE=0");

  rmSync(result.dataDir, { recursive: true, force: true });
});

test("import cron rejects invalid expressions", () => {
  const result = runCli(["import", "cron", "not a cron"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid cron expression/);

  rmSync(result.dataDir, { recursive: true, force: true });
});

test("import cron rejects unsupported W modifier", () => {
  const result = runCli(["import", "cron", "0 9 15W * *"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not supported/i);

  rmSync(result.dataDir, { recursive: true, force: true });
});
