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

test("local commands accept a unique id prefix and reject ambiguous prefixes", () => {
  const dataDir = makeTempDir();

  const db = new DatabaseSync(join(dataDir, "scheduler.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_schedules (
      id TEXT PRIMARY KEY,
      name TEXT,
      rrule TEXT NOT NULL,
      timezone TEXT NOT NULL,
      dtstart TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      next_occurrence TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const statement = db.prepare(`
    INSERT INTO local_schedules (
      id, name, rrule, timezone, dtstart, command, status, next_occurrence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  statement.run(
    "abcdef12-1111-1111-1111-111111111111",
    "One",
    "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    "UTC",
    "2026-04-01T09:00:00.000Z",
    "echo one",
    "active",
    "2026-04-02T09:00:00.000Z",
    "2026-04-01T09:00:00.000Z",
    "2026-04-01T09:00:00.000Z",
  );
  statement.run(
    "abcdef34-2222-2222-2222-222222222222",
    "Two",
    "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    "UTC",
    "2026-04-01T09:00:00.000Z",
    "echo two",
    "active",
    "2026-04-02T09:00:00.000Z",
    "2026-04-01T09:00:00.000Z",
    "2026-04-01T09:00:00.000Z",
  );
  db.close();

  const uniquePrefix = parseJson(runCli(["local", "pause", "abcdef12", "--json"], { dataDir }));
  assert.deepEqual(uniquePrefix, {
    id: "abcdef12-1111-1111-1111-111111111111",
    status: "paused",
  });

  const ambiguousPrefix = runCli(["local", "remove", "abc", "--json"], { dataDir });
  assert.equal(ambiguousPrefix.status, 2);
  assert.match(ambiguousPrefix.stderr, /Ambiguous local schedule id/);

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
