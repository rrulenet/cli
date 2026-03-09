import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDbPath } from "./config.js";
import { CliError } from "./errors.js";
import { computeNextOccurrence, isValidRRule } from "./rrule-utils.js";

export type LocalScheduleStatus = "active" | "paused";

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
}

interface LocalScheduleLookup {
  id: string;
  rrule: string;
  dtstart: string;
  timezone: string;
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
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
  };
}

export function listLocalSchedules(db: DatabaseSync): LocalScheduleRow[] {
  const rows = db
    .prepare(`
      SELECT id, name, rrule, timezone, dtstart, command, status, next_occurrence, created_at
      FROM local_schedules
      ORDER BY created_at DESC
    `)
    .all() as unknown as LocalScheduleRow[];

  return rows;
}

export function updateLocalStatus(db: DatabaseSync, id: string, status: LocalScheduleStatus): boolean {
  const row = db
    .prepare("SELECT id, rrule, dtstart, timezone FROM local_schedules WHERE id = ?")
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
