import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cliDir = new URL("..", import.meta.url);

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "rrulenet-cli-p2-service-"));
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

test("local service print emits a launchd template", () => {
  const result = runCli(["local", "service", "print", "--target", "launchd"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<plist version="1.0">/);
  assert.match(result.stdout, /<string>local<\/string>/);
  assert.match(result.stdout, /<string>run<\/string>/);
  rmSync(result.dataDir, { recursive: true, force: true });
});

test("local service print emits a systemd user template", () => {
  const result = runCli([
    "local",
    "service",
    "print",
    "--target",
    "systemd-user",
    "--interval-ms",
    "7000",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[Unit\]/);
  assert.match(result.stdout, /ExecStart=rrulenet local run --interval-ms 7000/);
  assert.match(result.stdout, /WantedBy=default\.target/);
  rmSync(result.dataDir, { recursive: true, force: true });
});
