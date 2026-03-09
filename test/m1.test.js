import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const cliDir = new URL("..", import.meta.url);
const snapshotDir = new URL("./__snapshots__/", import.meta.url);
const updateSnapshots = process.env.UPDATE_SNAPSHOTS === "1";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-test-"));
}

function runCli(args, options = {}) {
  const dataDir = options.dataDir ?? makeTempDir();
  const result = spawnSync("node", [...(options.nodeArgs ?? []), "./bin/run.js", ...args], {
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

function initializeLocalDb(dataDir, rows) {
  mkdirSync(dataDir, { recursive: true });
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

  for (const row of rows) {
    statement.run(
      row.id,
      row.name ?? null,
      row.rrule,
      row.timezone,
      row.dtstart,
      row.command,
      row.status,
      row.next_occurrence,
      row.created_at,
      row.updated_at,
    );
  }

  db.close();
}

function normalizeHelp(output) {
  return output
    .replace(/^  @rrulenet\/cli\/.*$/m, "  <VERSION>")
    .trimEnd();
}

function matchSnapshot(name, output) {
  const path = new URL(`./__snapshots__/${name}`, import.meta.url);
  mkdirSync(new URL("./__snapshots__/", import.meta.url), { recursive: true });
  if (updateSnapshots) {
    writeFileSync(path, output);
    return;
  }

  const expected = readFileSync(path, "utf8");
  assert.equal(output, expected);
}

function parseJsonOutput(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.stringify(JSON.parse(result.stdout), null, 2);
}

function withMockedFetch(routes, args, options = {}) {
  return runCli(args, {
    ...options,
    nodeArgs: ["--import", "./test/support/mock-fetch.js"],
    env: {
      ...options.env,
      RRULENET_TEST_FETCH_ROUTES: JSON.stringify(routes),
    },
  });
}

test("help output snapshots stay stable", async () => {
  const cases = [
    ["help-root.txt", ["--help"]],
    ["help-local.txt", ["local", "--help"]],
    ["help-cloud.txt", ["cloud", "--help"]],
    ["help-config.txt", ["config", "--help"]],
    ["help-list.txt", ["list", "--help"]],
    ["help-local-add.txt", ["local", "add", "--help"]],
    ["help-cloud-add.txt", ["cloud", "add", "--help"]],
  ];

  for (const [snapshotName, args] of cases) {
    const result = runCli(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    matchSnapshot(snapshotName, `${normalizeHelp(result.stdout)}\n`);
    rmSync(result.dataDir, { recursive: true, force: true });
  }
});

test("local list json snapshot stays stable", () => {
  const dataDir = makeTempDir();
  initializeLocalDb(dataDir, [
    {
      id: "local-1",
      name: "Morning sync",
      rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      timezone: "Europe/Paris",
      dtstart: "2026-03-01T08:00:00.000Z",
      command: "echo sync",
      status: "active",
      next_occurrence: "2026-03-10T08:00:00.000Z",
      created_at: "2026-03-01T07:00:00.000Z",
      updated_at: "2026-03-01T07:00:00.000Z",
    },
  ]);

  const result = runCli(["local", "list", "--json"], { dataDir });
  matchSnapshot("local-list.json", `${parseJsonOutput(result)}\n`);
  rmSync(dataDir, { recursive: true, force: true });
});

test("cloud list json snapshot stays stable", () => {
  const result = withMockedFetch(
    {
      "GET /v1/schedules": {
        status: 200,
        body: {
          schedules: [
            {
              id: "cloud-1",
              status: "active",
              timezone: "UTC",
              rrule: { rule: "FREQ=HOURLY;INTERVAL=6" },
              webhook: { url: "https://example.com/hook" },
              next_occurrence: "2026-03-09T12:00:00.000Z",
              created_at: "2026-03-01T10:00:00.000Z",
            },
          ],
        },
      },
    },
    ["cloud", "list", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );
  matchSnapshot("cloud-list.json", `${parseJsonOutput(result)}\n`);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("combined list json snapshot stays stable", () => {
  const dataDir = makeTempDir();
  initializeLocalDb(dataDir, [
    {
      id: "local-1",
      name: "Morning sync",
      rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      timezone: "Europe/Paris",
      dtstart: "2026-03-01T08:00:00.000Z",
      command: "echo sync",
      status: "active",
      next_occurrence: "2026-03-10T08:00:00.000Z",
      created_at: "2026-03-03T07:00:00.000Z",
      updated_at: "2026-03-03T07:00:00.000Z",
    },
  ]);

  const result = withMockedFetch(
    {
      "GET /v1/schedules": {
        status: 200,
        body: {
          schedules: [
            {
              id: "cloud-1",
              status: "paused",
              timezone: "UTC",
              rrule: "FREQ=WEEKLY;BYDAY=MO",
              webhook: { url: "https://example.com/weekly" },
              next_occurrence: "2026-03-16T00:00:00.000Z",
              created_at: "2026-03-02T09:30:00.000Z",
            },
          ],
        },
      },
    },
    ["list", "--origin", "all", "--json"],
    {
      dataDir,
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  matchSnapshot("list-all.json", `${parseJsonOutput(result)}\n`);
  rmSync(dataDir, { recursive: true, force: true });
});

test("exit code mapping for basic usage errors stays stable", () => {
  const missingCommand = runCli([
    "local",
    "add",
    "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
  ]);
  assert.equal(missingCommand.status, 2);

  const missingToken = runCli(["cloud", "list"], {
    env: {
      RRULENET_TOKEN: "",
    },
  });
  assert.equal(missingToken.status, 3);

  rmSync(missingCommand.dataDir, { recursive: true, force: true });
  rmSync(missingToken.dataDir, { recursive: true, force: true });
});
