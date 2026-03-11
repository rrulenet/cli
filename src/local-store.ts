import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDbPath } from "./config.js";
import { CliError } from "./errors.js";
import { computeNextOccurrence, isValidRRule } from "./rrule-utils.js";

export type LocalScheduleStatus = "active" | "paused";
export type LocalExecutionStatus = "running" | "success" | "failed" | null;

export interface LocalScheduleInput {
  name: string | null;
  rrule: string;
  timezone: string;
  dtstart: string;
  command: string;
}

export interface LocalScheduleRow extends LocalScheduleInput {
  id: string;
  status: LocalScheduleStatus;
  next_occurrence: string | null;
  created_at: string;
  execution_status: LocalExecutionStatus;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_error: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  retry_count: number;
  next_retry_at: string | null;
}

interface LocalScheduleLookup {
  id: string;
  rrule: string;
  dtstart: string;
  timezone: string;
  command: string;
  next_occurrence: string | null;
  last_run_started_at?: string | null;
}

export interface DueLocalSchedule extends LocalScheduleLookup {
  status: LocalScheduleStatus;
}

export interface LocalRunLock {
  owner: string;
  locked_until: string;
}

export function openLocalStore(): DatabaseSync {
  const db = new DatabaseSync(getDbPath());
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
      execution_status TEXT,
      last_run_started_at TEXT,
      last_run_finished_at TEXT,
      last_run_error TEXT,
      last_success_at TEXT,
      last_failure_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS runner_locks (
      name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      locked_until TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "local_schedules", "execution_status", "TEXT");
  ensureColumn(db, "local_schedules", "last_run_started_at", "TEXT");
  ensureColumn(db, "local_schedules", "last_run_finished_at", "TEXT");
  ensureColumn(db, "local_schedules", "last_run_error", "TEXT");
  ensureColumn(db, "local_schedules", "last_success_at", "TEXT");
  ensureColumn(db, "local_schedules", "last_failure_at", "TEXT");
  ensureColumn(db, "local_schedules", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "local_schedules", "next_retry_at", "TEXT");
  return db;
}

export function addLocalSchedule(db: DatabaseSync, scheduleInput: LocalScheduleInput): LocalScheduleRow {
  const { name, rrule, timezone, dtstart, command } = scheduleInput;
  if (!isValidRRule(rrule, dtstart, timezone)) {
    throw new CliError("Invalid RRule or no future occurrence", 2);
  }

  const nowIso = new Date().toISOString();
  const id = randomUUID();
  const nextOccurrence = computeNextOccurrence(rrule, dtstart, timezone, new Date());

  db.prepare(`
    INSERT INTO local_schedules (
      id, name, rrule, timezone, dtstart, command, status, next_occurrence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(id, name, rrule, timezone, dtstart, command, nextOccurrence, nowIso, nowIso);

  return {
    id,
    name,
    rrule,
    timezone,
    dtstart,
    command,
    status: "active",
    next_occurrence: nextOccurrence,
    created_at: nowIso,
    execution_status: null,
    last_run_started_at: null,
    last_run_finished_at: null,
    last_run_error: null,
    last_success_at: null,
    last_failure_at: null,
    retry_count: 0,
    next_retry_at: null,
  };
}

export function listLocalSchedules(db: DatabaseSync): LocalScheduleRow[] {
  return db
    .prepare(`
      SELECT
        id,
        name,
        rrule,
        timezone,
        dtstart,
        command,
        status,
        next_occurrence,
        created_at,
        execution_status,
        last_run_started_at,
        last_run_finished_at,
        last_run_error,
        last_success_at,
        last_failure_at,
        retry_count,
        next_retry_at
      FROM local_schedules
      ORDER BY created_at DESC
    `)
    .all() as unknown as LocalScheduleRow[];
}

export function updateLocalStatus(db: DatabaseSync, id: string, status: LocalScheduleStatus): boolean {
  const row = db
    .prepare("SELECT id, rrule, dtstart, timezone, command, next_occurrence FROM local_schedules WHERE id = ?")
    .get(id) as LocalScheduleLookup | undefined;

  if (!row) return false;

  const nextOccurrence =
    status === "active" ? computeNextOccurrence(row.rrule, row.dtstart, row.timezone, new Date()) : null;

  const updated = db
    .prepare(`
      UPDATE local_schedules
      SET status = ?, next_occurrence = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(status, nextOccurrence, new Date().toISOString(), id);

  return updated.changes > 0;
}

export function removeLocalSchedule(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("DELETE FROM local_schedules WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listDueLocalSchedules(db: DatabaseSync, nowIso: string): DueLocalSchedule[] {
  return db
    .prepare(`
      SELECT id, rrule, dtstart, timezone, command, next_occurrence, status
      FROM local_schedules
      WHERE status = 'active'
        AND next_occurrence IS NOT NULL
        AND next_occurrence <= ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY next_occurrence ASC, created_at ASC
    `)
    .all(nowIso, nowIso) as unknown as DueLocalSchedule[];
}

export function markLocalScheduleRunning(db: DatabaseSync, id: string, startedAt: string): void {
  db.prepare(`
    UPDATE local_schedules
    SET execution_status = 'running',
        last_run_started_at = ?,
        last_run_finished_at = NULL,
        last_run_error = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(startedAt, startedAt, id);
}

export function completeLocalScheduleRun(
  db: DatabaseSync,
  schedule: DueLocalSchedule,
  finishedAt: string,
): void {
  const nextOccurrence = computeNextOccurrence(schedule.rrule, schedule.dtstart, schedule.timezone, new Date(finishedAt));

  db.prepare(`
    UPDATE local_schedules
    SET execution_status = 'success',
        next_occurrence = ?,
        last_run_finished_at = ?,
        last_run_error = NULL,
        last_success_at = ?,
        retry_count = 0,
        next_retry_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextOccurrence,
    finishedAt,
    finishedAt,
    finishedAt,
    schedule.id,
  );
}

export function failLocalScheduleRun(
  db: DatabaseSync,
  schedule: DueLocalSchedule,
  finishedAt: string,
  errorMessage: string,
  maxRetries: number,
  backoffMs: number,
): { willRetry: boolean; retryCount: number } {
  const current = db
    .prepare("SELECT retry_count FROM local_schedules WHERE id = ?")
    .get(schedule.id) as { retry_count: number };

  const retryCount = current.retry_count + 1;
  const willRetry = retryCount <= maxRetries;
  const nextOccurrence = willRetry
    ? schedule.next_occurrence
    : computeNextOccurrence(schedule.rrule, schedule.dtstart, schedule.timezone, new Date(finishedAt));
  const nextRetryAt = willRetry
    ? new Date(Date.parse(finishedAt) + backoffMs * 2 ** (retryCount - 1)).toISOString()
    : null;

  db.prepare(`
    UPDATE local_schedules
    SET execution_status = 'failed',
        next_occurrence = ?,
        last_run_finished_at = ?,
        last_run_error = ?,
        last_failure_at = ?,
        retry_count = ?,
        next_retry_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextOccurrence,
    finishedAt,
    errorMessage,
    finishedAt,
    willRetry ? retryCount : 0,
    nextRetryAt,
    finishedAt,
    schedule.id,
  );

  return {
    willRetry,
    retryCount,
  };
}

export function recoverInterruptedRuns(db: DatabaseSync, recoveredAt: string): number {
  const interrupted = db
    .prepare(`
      SELECT id, rrule, dtstart, timezone, command, next_occurrence, last_run_started_at
      FROM local_schedules
      WHERE execution_status = 'running'
      ORDER BY last_run_started_at ASC, created_at ASC
    `)
    .all() as unknown as LocalScheduleLookup[];

  for (const schedule of interrupted) {
    const resumeFrom = schedule.next_occurrence ?? schedule.last_run_started_at ?? recoveredAt;
    const nextOccurrence = computeNextOccurrence(
      schedule.rrule,
      schedule.dtstart,
      schedule.timezone,
      new Date(resumeFrom),
    );

    db.prepare(`
      UPDATE local_schedules
      SET execution_status = 'failed',
          next_occurrence = ?,
          last_run_finished_at = ?,
          last_run_error = ?,
          last_failure_at = ?,
          retry_count = 0,
          next_retry_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextOccurrence,
      recoveredAt,
      "Runner interrupted before completion",
      recoveredAt,
      recoveredAt,
      schedule.id,
    );
  }

  return interrupted.length;
}

export function acquireRunnerLock(db: DatabaseSync, owner: string, lockMs: number): boolean {
  const nowIso = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + lockMs).toISOString();
  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      INSERT OR IGNORE INTO runner_locks (name, owner, locked_until, updated_at)
      VALUES ('local-runner', ?, ?, ?)
    `).run(owner, lockedUntil, nowIso);

    const existing = db
      .prepare("SELECT owner, locked_until FROM runner_locks WHERE name = 'local-runner'")
      .get() as LocalRunLock | undefined;

    if (!existing) {
      db.exec("ROLLBACK");
      return false;
    }

    if (existing.locked_until <= nowIso) {
      db.prepare(`
        UPDATE runner_locks
        SET owner = ?, locked_until = ?, updated_at = ?
        WHERE name = 'local-runner' AND locked_until <= ?
      `).run(owner, lockedUntil, nowIso, nowIso);
    }

    const current = db
      .prepare("SELECT owner FROM runner_locks WHERE name = 'local-runner'")
      .get() as { owner: string };

    const acquired = current.owner === owner;
    db.exec(acquired ? "COMMIT" : "ROLLBACK");
    return acquired;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function releaseRunnerLock(db: DatabaseSync, owner: string): void {
  db.prepare("DELETE FROM runner_locks WHERE name = 'local-runner' AND owner = ?").run(owner);
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
