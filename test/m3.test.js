import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const cliDir = new URL("..", import.meta.url);

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-m3-"));
}

function runCli(args, options = {}) {
  const dataDir = options.dataDir ?? makeTempDir();
  const result = spawnSync("node", ["./bin/run.js", ...args], {
    cwd: cliDir,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
      RRULENET_DATA_DIR: dataDir,
      ...options.env,
    },
  });

  return {
    ...result,
    dataDir,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("local schedule lifecycle persists across command restarts", () => {
  const dataDir = makeTempDir();

  const added = parseJson(
    runCli(
      [
        "local",
        "add",
        "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
        "--timezone",
        "Europe/Paris",
        "--dtstart",
        "2026-04-01T07:00:00.000Z",
        "--name",
        "Morning sync",
        "--json",
        "--",
        "echo sync",
      ],
      { dataDir },
    ),
  );

  assert.equal(added.status, "active");
  assert.equal(added.name, "Morning sync");

  const initialList = parseJson(runCli(["local", "list", "--json"], { dataDir }));
  assert.equal(initialList.length, 1);
  assert.equal(initialList[0].id, added.id);
  assert.equal(initialList[0].status, "active");
  assert.equal(initialList[0].target, "echo sync");

  const paused = parseJson(runCli(["local", "pause", added.id, "--json"], { dataDir }));
  assert.deepEqual(paused, { id: added.id, status: "paused" });

  const pausedList = parseJson(runCli(["local", "list", "--json"], { dataDir }));
  assert.equal(pausedList[0].status, "paused");
  assert.equal(pausedList[0].next_occurrence, null);

  const resumed = parseJson(runCli(["local", "resume", added.id, "--json"], { dataDir }));
  assert.deepEqual(resumed, { id: added.id, status: "active" });

  const resumedList = parseJson(runCli(["local", "list", "--json"], { dataDir }));
  assert.equal(resumedList[0].status, "active");
  assert.equal(typeof resumedList[0].next_occurrence, "string");

  const removed = parseJson(runCli(["local", "remove", added.id, "--json"], { dataDir }));
  assert.deepEqual(removed, { id: added.id, removed: true });

  const finalList = parseJson(runCli(["local", "list", "--json"], { dataDir }));
  assert.deepEqual(finalList, []);

  rmSync(dataDir, { recursive: true, force: true });
});

test("local store uses WAL mode after repeated command runs", () => {
  const dataDir = makeTempDir();

  parseJson(
    runCli(
      [
        "local",
        "add",
        "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
        "--dtstart",
        "2026-04-01T09:00:00.000Z",
        "--json",
        "--",
        "echo wal",
      ],
      { dataDir },
    ),
  );

  parseJson(runCli(["local", "list", "--json"], { dataDir }));
  parseJson(runCli(["local", "list", "--json"], { dataDir }));

  const db = new DatabaseSync(join(dataDir, "scheduler.db"));
  const row = db.prepare("PRAGMA journal_mode;").get();
  db.close();

  assert.equal(String(row.journal_mode).toLowerCase(), "wal");
  rmSync(dataDir, { recursive: true, force: true });
});

test("restart behavior preserves persisted schedules", () => {
  const dataDir = makeTempDir();

  const added = parseJson(
    runCli(
      [
        "local",
        "add",
        "FREQ=WEEKLY;BYDAY=MO;BYHOUR=18;BYMINUTE=0;BYSECOND=0",
        "--timezone",
        "Europe/Paris",
        "--dtstart",
        "2026-04-06T16:00:00.000Z",
        "--json",
        "--",
        "./deploy.sh",
      ],
      { dataDir },
    ),
  );

  const afterRestart = parseJson(runCli(["local", "list", "--json"], { dataDir }));
  assert.equal(afterRestart.length, 1);
  assert.equal(afterRestart[0].id, added.id);
  assert.equal(afterRestart[0].target, "./deploy.sh");
  assert.equal(afterRestart[0].rrule, "FREQ=WEEKLY;BYDAY=MO;BYHOUR=18;BYMINUTE=0;BYSECOND=0");

  rmSync(dataDir, { recursive: true, force: true });
});

test("local add accepts minutely rules with implicit dtstart", () => {
  const dataDir = makeTempDir();

  const added = parseJson(
    runCli(
      [
        "local",
        "add",
        "FREQ=MINUTELY",
        "--name",
        "Test minute",
        "--timezone",
        "Europe/Paris",
        "--json",
        "--",
        "echo One more minute...",
      ],
      { dataDir },
    ),
  );

  assert.equal(added.status, "active");
  assert.equal(added.name, "Test minute");
  assert.equal(added.rrule, "FREQ=MINUTELY");
  assert.equal(added.timezone, "Europe/Paris");
  assert.equal(typeof added.next_occurrence, "string");

  rmSync(dataDir, { recursive: true, force: true });
});

test("invalid local inputs and missing resources fail with usage exit codes", () => {
  const dataDir = makeTempDir();

  const invalidRule = runCli(
    [
      "local",
      "add",
      "NOT_A_RULE",
      "--dtstart",
      "2026-04-01T09:00:00.000Z",
      "--json",
      "--",
      "echo bad",
    ],
    { dataDir },
  );
  assert.equal(invalidRule.status, 2);

  const missingCommand = runCli(
    [
      "local",
      "add",
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      "--dtstart",
      "2026-04-01T09:00:00.000Z",
    ],
    { dataDir },
  );
  assert.equal(missingCommand.status, 2);

  const missingSchedule = runCli(["local", "pause", "missing-id"], { dataDir });
  assert.equal(missingSchedule.status, 2);

  rmSync(dataDir, { recursive: true, force: true });
});
