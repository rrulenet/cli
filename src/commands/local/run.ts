import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { CliError } from "../../errors.js";
import { output } from "../../lib/output.js";

const execAsync = promisify(exec);

export default class LocalRun extends BaseCommand<typeof LocalRun> {
  static override summary = "Run due local schedules";
  static override examples = [
    "<%= config.bin %> local run --once",
    "<%= config.bin %> local run --interval-ms 5000",
    "<%= config.bin %> local run --once --timeout-ms 10000 --json",
    "<%= config.bin %> local run --once --max-retries 2 --backoff-ms 5000",
  ];

  static override flags = {
    once: Flags.boolean({
      default: false,
      description: "Run due schedules once and exit",
    }),
    "interval-ms": Flags.integer({
      default: 5000,
      description: "Polling interval in milliseconds for continuous mode",
    }),
    "timeout-ms": Flags.integer({
      default: 30000,
      description: "Maximum execution time per command",
    }),
    "max-retries": Flags.integer({
      default: 0,
      description: "Retries per failed occurrence before advancing to the next one",
    }),
    "backoff-ms": Flags.integer({
      default: 5000,
      description: "Base backoff in milliseconds between retries",
    }),
    "lock-ms": Flags.integer({
      default: 300000,
      description: "Lock TTL to prevent concurrent runners",
    }),
    "max-cycles": Flags.integer({
      hidden: true,
      description: "Maximum cycles to run before exit",
    }),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const { flags } = await this.parse(LocalRun);
    const local = await import("../../local-store.js");
    const db = local.openLocalStore();
    const owner = randomUUID();

    if (flags["max-retries"] < 0) {
      throw new CliError("Invalid max-retries. Use a value greater than or equal to 0.", 2);
    }

    if (flags["backoff-ms"] < 0) {
      throw new CliError("Invalid backoff-ms. Use a value greater than or equal to 0.", 2);
    }

    if (flags["interval-ms"] < 0) {
      throw new CliError("Invalid interval-ms. Use a value greater than or equal to 0.", 2);
    }

    if (!local.acquireRunnerLock(db, owner, flags["lock-ms"])) {
      throw new CliError("Local runner already active", 1);
    }

    try {
      const summary = {
        executed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        recovered: 0,
        retried: 0,
      };

      let keepRunning = true;
      let cycleCount = 0;
      const stop = () => {
        keepRunning = false;
      };

      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);

      try {
        while (keepRunning) {
          cycleCount += 1;
          await runCycle(local, db, summary, {
            timeoutMs: flags["timeout-ms"],
            maxRetries: flags["max-retries"],
            backoffMs: flags["backoff-ms"],
            jsonMode: this.jsonMode,
          });

          if (flags.once) break;
          if (flags["max-cycles"] && cycleCount >= flags["max-cycles"]) break;
          if (!keepRunning) break;
          await sleep(flags["interval-ms"]);
        }
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }

      output(summary, this.jsonMode);
      if (summary.failed > 0) process.exitCode = 1;
    } finally {
      local.releaseRunnerLock(db, owner);
    }
  }
}

async function runCycle(
  local: typeof import("../../local-store.js"),
  db: Awaited<ReturnType<typeof import("../../local-store.js")["openLocalStore"]>>,
  summary: {
    executed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    recovered: number;
    retried: number;
  },
  options: {
    timeoutMs: number;
    maxRetries: number;
    backoffMs: number;
    jsonMode: boolean;
  },
): Promise<void> {
  summary.recovered += local.recoverInterruptedRuns(db, new Date().toISOString());
  const nowIso = new Date().toISOString();
  const dueSchedules = local.listDueLocalSchedules(db, nowIso);

  for (const schedule of dueSchedules) {
    const startedAt = new Date().toISOString();
    local.markLocalScheduleRunning(db, schedule.id, startedAt);

    try {
      const result = await execAsync(schedule.command, {
        timeout: options.timeoutMs,
        shell: process.env.SHELL || "/bin/sh",
      });
      relayCommandOutput(result.stdout, result.stderr, options.jsonMode);
      local.completeLocalScheduleRun(db, schedule, new Date().toISOString());
      summary.executed += 1;
      summary.succeeded += 1;
    } catch (error) {
      relayCommandOutput(getCapturedStdout(error), getCapturedStderr(error), options.jsonMode);
      const message = getExecutionErrorMessage(error, options.timeoutMs);
      const retry = local.failLocalScheduleRun(
        db,
        schedule,
        new Date().toISOString(),
        message,
        options.maxRetries,
        options.backoffMs,
      );
      summary.executed += 1;
      summary.failed += 1;
      if (retry.willRetry) summary.retried += 1;
    }
  }
}

function getExecutionErrorMessage(error: unknown, timeoutMs: number): string {
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: string;
      killed?: boolean;
      signal?: string | null;
      code?: string | number | null;
    };

    if (candidate.killed || candidate.signal === "SIGTERM") {
      return `Command timed out after ${timeoutMs}ms`;
    }

    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }

  return String(error);
}

function relayCommandOutput(stdout: string | undefined, stderr: string | undefined, jsonMode: boolean): void {
  if (jsonMode) return;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

function getCapturedStdout(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { stdout?: string };
  return typeof candidate.stdout === "string" ? candidate.stdout : undefined;
}

function getCapturedStderr(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { stderr?: string };
  return typeof candidate.stderr === "string" ? candidate.stderr : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
