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
