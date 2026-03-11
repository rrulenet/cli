import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { openLocalStore, addLocalSchedule } from "../dist/local-store.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-p2-"));
}

function runCli(args, options = {}) {
  const dataDir = options.dataDir ?? makeTempDir();
  const result = spawnSync("node", ["./bin/run.js", ...args], {
    cwd: new URL("..", import.meta.url),
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

function createDueSchedule(dataDir, command) {
  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  const schedule = addLocalSchedule(db, {
    name: null,
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    timezone: "UTC",
    dtstart: "2026-04-01T09:00:00.000Z",
    command,
  });

  db.prepare("UPDATE local_schedules SET next_occurrence = ? WHERE id = ?").run(
    new Date(Date.now() - 1000).toISOString(),
    schedule.id,
  );
  db.close();
  delete process.env.RRULENET_DATA_DIR;
  return schedule.id;
}

test("local run executes due schedules once and advances persisted state", () => {
  const dataDir = makeTempDir();
  const markerFile = join(dataDir, "runner.log");
  const scheduleId = createDueSchedule(dataDir, 'printf "run\\n" >> "$RRULENET_MARKER_FILE"');

  const firstRun = runCli(["local", "run", "--once", "--json"], {
    dataDir,
    env: {
      RRULENET_MARKER_FILE: markerFile,
    },
  });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.deepEqual(JSON.parse(firstRun.stdout), {
    executed: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
    recovered: 0,
    retried: 0,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  const row = db
    .prepare(`
      SELECT execution_status, last_success_at, last_run_error, next_occurrence
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "success");
  assert.equal(typeof row.last_success_at, "string");
  assert.equal(row.last_run_error, null);
  assert.equal(typeof row.next_occurrence, "string");

  const secondRun = runCli(["local", "run", "--once", "--json"], {
    dataDir,
    env: {
      RRULENET_MARKER_FILE: markerFile,
    },
  });
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.deepEqual(JSON.parse(secondRun.stdout), {
    executed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    recovered: 0,
    retried: 0,
  });

  assert.equal(readFileSync(markerFile, "utf8"), "run\n");
  rmSync(dataDir, { recursive: true, force: true });
});

test("local run refuses to start when the runner lock is already held", () => {
  const dataDir = makeTempDir();
  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  db.prepare(`
    INSERT INTO runner_locks (name, owner, locked_until, updated_at)
    VALUES ('local-runner', 'other-runner', ?, ?)
  `).run(
    new Date(Date.now() + 60_000).toISOString(),
    new Date().toISOString(),
  );
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  const result = runCli(["local", "run", "--once"], { dataDir });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Local runner already active/);

  rmSync(dataDir, { recursive: true, force: true });
});

test("local run persists failed execution state", () => {
  const dataDir = makeTempDir();
  const scheduleId = createDueSchedule(dataDir, "exit 7");

  const result = runCli(["local", "run", "--once", "--json"], { dataDir });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    executed: 1,
    succeeded: 0,
    failed: 1,
    skipped: 0,
    recovered: 0,
    retried: 0,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  const row = db
    .prepare(`
      SELECT execution_status, last_failure_at, last_run_error, next_occurrence
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "failed");
  assert.equal(typeof row.last_failure_at, "string");
  assert.equal(typeof row.last_run_error, "string");
  assert.equal(typeof row.next_occurrence, "string");

  rmSync(dataDir, { recursive: true, force: true });
});

test("local run recovers interrupted schedules after an expired lock", () => {
  const dataDir = makeTempDir();
  const scheduleId = createDueSchedule(dataDir, 'printf "recovered\\n" >> "$RRULENET_MARKER_FILE"');

  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  db.prepare(`
    UPDATE local_schedules
    SET execution_status = 'running',
        last_run_started_at = ?,
        next_occurrence = ?
    WHERE id = ?
  `).run(
    new Date(Date.now() - 60_000).toISOString(),
    new Date(Date.now() - 60_000).toISOString(),
    scheduleId,
  );
  db.prepare(`
    INSERT INTO runner_locks (name, owner, locked_until, updated_at)
    VALUES ('local-runner', 'stale-runner', ?, ?)
  `).run(
    new Date(Date.now() - 1_000).toISOString(),
    new Date(Date.now() - 60_000).toISOString(),
  );
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  const markerFile = join(dataDir, "recovery.log");
  const result = runCli(["local", "run", "--once", "--json"], {
    dataDir,
    env: {
      RRULENET_MARKER_FILE: markerFile,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    executed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    recovered: 1,
    retried: 0,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  const reopened = openLocalStore();
  const row = reopened
    .prepare(`
      SELECT execution_status, last_failure_at, last_run_error, next_occurrence
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  reopened.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "failed");
  assert.equal(typeof row.last_failure_at, "string");
  assert.equal(row.last_run_error, "Runner interrupted before completion");
  assert.equal(typeof row.next_occurrence, "string");
  assert.equal(result.stderr, "");

  rmSync(dataDir, { recursive: true, force: true });
});

test("local run retries a failed occurrence after backoff and clears retry state on success", async () => {
  const dataDir = makeTempDir();
  const markerFile = join(dataDir, "retry.log");
  const stateFile = join(dataDir, "retry.state");
  const scheduleId = createDueSchedule(
    dataDir,
    'if [ -f "$RRULENET_RETRY_STATE" ]; then printf "ok\\n" >> "$RRULENET_MARKER_FILE"; else touch "$RRULENET_RETRY_STATE"; exit 1; fi',
  );

  const firstRun = runCli(
    ["local", "run", "--once", "--json", "--max-retries", "1", "--backoff-ms", "10"],
    {
      dataDir,
      env: {
        RRULENET_MARKER_FILE: markerFile,
        RRULENET_RETRY_STATE: stateFile,
      },
    },
  );
  assert.equal(firstRun.status, 1);
  assert.deepEqual(JSON.parse(firstRun.stdout), {
    executed: 1,
    succeeded: 0,
    failed: 1,
    skipped: 0,
    recovered: 0,
    retried: 1,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  let db = openLocalStore();
  let row = db
    .prepare(`
      SELECT execution_status, retry_count, next_retry_at, next_occurrence
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "failed");
  assert.equal(row.retry_count, 1);
  assert.equal(typeof row.next_retry_at, "string");
  assert.equal(typeof row.next_occurrence, "string");

  await new Promise((resolve) => setTimeout(resolve, 25));

  const secondRun = runCli(
    ["local", "run", "--once", "--json", "--max-retries", "1", "--backoff-ms", "10"],
    {
      dataDir,
      env: {
        RRULENET_MARKER_FILE: markerFile,
        RRULENET_RETRY_STATE: stateFile,
      },
    },
  );
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.deepEqual(JSON.parse(secondRun.stdout), {
    executed: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
    recovered: 0,
    retried: 0,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  db = openLocalStore();
  row = db
    .prepare(`
      SELECT execution_status, retry_count, next_retry_at, next_occurrence
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "success");
  assert.equal(row.retry_count, 0);
  assert.equal(row.next_retry_at, null);
  assert.equal(readFileSync(markerFile, "utf8"), "ok\n");

  rmSync(dataDir, { recursive: true, force: true });
});

test("local run timeout failure schedules a retry when retries remain", () => {
  const dataDir = makeTempDir();
  const scheduleId = createDueSchedule(dataDir, "sleep 1");

  const result = runCli(
    ["local", "run", "--once", "--json", "--timeout-ms", "10", "--max-retries", "1", "--backoff-ms", "10"],
    { dataDir },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    executed: 1,
    succeeded: 0,
    failed: 1,
    skipped: 0,
    recovered: 0,
    retried: 1,
  });

  process.env.RRULENET_DATA_DIR = dataDir;
  const db = openLocalStore();
  const row = db
    .prepare(`
      SELECT execution_status, retry_count, next_retry_at, last_run_error
      FROM local_schedules
      WHERE id = ?
    `)
    .get(scheduleId);
  db.close();
  delete process.env.RRULENET_DATA_DIR;

  assert.equal(row.execution_status, "failed");
  assert.equal(row.retry_count, 1);
  assert.equal(typeof row.next_retry_at, "string");
  assert.match(String(row.last_run_error), /timed out|timeout/i);

  rmSync(dataDir, { recursive: true, force: true });
});

test("local run continuous mode processes retries across multiple cycles", () => {
  const dataDir = makeTempDir();
  const markerFile = join(dataDir, "continuous.log");
  const stateFile = join(dataDir, "continuous.state");

  createDueSchedule(
    dataDir,
    'if [ -f "$RRULENET_RETRY_STATE" ]; then printf "loop\\n" >> "$RRULENET_MARKER_FILE"; else touch "$RRULENET_RETRY_STATE"; exit 1; fi',
  );

  const result = runCli(
    [
      "local",
      "run",
      "--json",
      "--interval-ms",
      "20",
      "--max-cycles",
      "3",
      "--max-retries",
      "1",
      "--backoff-ms",
      "10",
    ],
    {
      dataDir,
      env: {
        RRULENET_MARKER_FILE: markerFile,
        RRULENET_RETRY_STATE: stateFile,
      },
    },
  );

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    executed: 2,
    succeeded: 1,
    failed: 1,
    skipped: 0,
    recovered: 0,
    retried: 1,
  });
  assert.equal(readFileSync(markerFile, "utf8"), "loop\n");

  rmSync(dataDir, { recursive: true, force: true });
});
