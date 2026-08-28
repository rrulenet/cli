import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cliDir = new URL("..", import.meta.url);

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-m4-"));
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

test("cloud list maps 401 auth failures to exit code 3 and keeps stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "GET /v1/schedules": {
        status: 401,
        body: { error: "unauthorized" },
      },
    },
    ["cloud", "list", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "bad-token",
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud list failed \(401\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud add maps 403 auth failures to exit code 3 and keeps stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "POST /v1/schedules": {
        status: 403,
        body: { error: "forbidden" },
      },
    },
    [
      "cloud",
      "add",
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      "--webhook",
      "https://example.com/hook",
      "--json",
    ],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "forbidden-token",
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud add failed \(403\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud pause maps 401 auth failures to exit code 3 and keeps stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "POST /v1/schedules/cloud-1/pause": {
        status: 401,
        body: { error: "unauthorized" },
      },
    },
    ["cloud", "pause", "cloud-1", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "bad-token",
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud pause failed \(401\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud pause accepts a unique short id prefix", () => {
  const result = withMockedFetch(
    {
      "POST /v1/schedules/abcd1234/pause": {
        status: 200,
        body: {
          id: "abcd1234efgh5678",
          status: "paused",
          timezone: "UTC",
          rrule: "FREQ=DAILY",
        },
      },
    },
    ["cloud", "pause", "abcd1234", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).id, "abcd1234efgh5678");
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud get accepts a unique short id prefix and returns the current API contract", () => {
  const schedule = {
    id: "abcd1234-0000-4000-8000-000000000000",
    name: "Morning sync",
    status: "active",
    pause_context: null,
    timezone: "Europe/Paris",
    input: { type: "natural", value: "every weekday at 09:00", language: "en" },
    recurrence: { frequency: "weekly", by_week_day: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
    targets: [],
    explanation: { text: "Every weekday at 09:00", confidence: 1, ambiguities: [] },
    webhook: { url: "https://example.com/hook" },
    last_occurrence: null,
    next_occurrence: "2026-08-31T07:00:00.000Z",
    recent_executions: [],
    created_at: "2026-08-28T08:00:00.000Z",
    updated_at: "2026-08-28T08:00:00.000Z",
  };
  const result = withMockedFetch(
    {
      "GET /v1/schedules/abcd1234": { status: 200, body: schedule },
    },
    ["cloud", "get", "abcd1234", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), schedule);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud executions supports short ids and pagination", () => {
  const payload = {
    executions: [
      {
        execution_id: "exec-1",
        schedule_id: "abcd1234-0000-4000-8000-000000000000",
        scheduled_for: "2026-08-28T09:00:00.000Z",
        executed_at: "2026-08-28T09:00:01.000Z",
        status: "success",
        response_code: 204,
        response_body: null,
        target: {
          id: "primary",
          label: "Primary webhook",
          timezone: "Europe/Paris",
          metadata: {},
        },
      },
    ],
    count: 1,
  };
  const result = withMockedFetch(
    {
      "GET /v1/schedules/abcd1234/executions?limit=25&offset=25": {
        status: 200,
        body: payload,
      },
    },
    ["cloud", "executions", "abcd1234", "--limit", "25", "--offset", "25", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), payload);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud pagination rejects limits outside the API contract", () => {
  const result = runCli(["cloud", "list", "--limit", "101", "--json"], {
    env: { RRULENET_TOKEN: "test-token" },
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /--limit must be between 1 and 100/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud resume maps 403 auth failures to exit code 3 and keeps stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "POST /v1/schedules/cloud-1/resume": {
        status: 403,
        body: { error: "forbidden" },
      },
    },
    ["cloud", "resume", "cloud-1", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "forbidden-token",
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud resume failed \(403\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud resume maps ambiguous short ids to exit code 2", () => {
  const result = withMockedFetch(
    {
      "POST /v1/schedules/abcd/resume": {
        status: 409,
        body: {
          error: "ambiguous_schedule_id",
          message: "Schedule id prefix matches multiple schedules. Use a longer prefix.",
        },
      },
    },
    ["cloud", "resume", "abcd", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud resume failed \(409\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud remove maps 401 auth failures to exit code 3 and keeps stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "DELETE /v1/schedules/cloud-1": {
        status: 401,
        body: { error: "unauthorized" },
      },
    },
    ["cloud", "remove", "cloud-1", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "bad-token",
      },
    },
  );

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud remove failed \(401\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud remove maps missing short ids to exit code 2", () => {
  const result = withMockedFetch(
    {
      "DELETE /v1/schedules/missing": {
        status: 404,
        body: {
          error: "schedule_not_found",
          message: "Schedule not found.",
        },
      },
    },
    ["cloud", "remove", "missing", "--json"],
    {
      env: {
        RRULENET_API_BASE_URL: "https://api.example.test",
        RRULENET_TOKEN: "test-token",
      },
    },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Cloud remove failed \(404\)/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("cloud network failures map to exit code 4 and keep stdout clean in json mode", () => {
  const result = withMockedFetch(
    {
      "GET /v1/schedules": {
        throw: "fetch failed",
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

  assert.equal(result.status, 4);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /fetch failed/i);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("missing cloud token maps to exit code 3 and keeps stdout clean in json mode", () => {
  const result = runCli(["cloud", "list", "--json"]);

  assert.equal(result.status, 3);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Missing cloud token/);
  rmSync(result.dataDir, { recursive: true, force: true });
});
