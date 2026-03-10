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
