import pc from "picocolors";
import Table from "cli-table3";
import type { CloudSchedule } from "../cloud-client.js";

export interface OutputRow {
  origin: "local" | "cloud";
  id: string;
  name?: string | null;
  status: string;
  timezone: string;
  rrule: string;
  target: string;
  next_occurrence: string | null;
  created_at: string | null;
}

export interface LocalScheduleRecord {
  id: string;
  name?: string | null;
  status: string;
  timezone: string;
  rrule: string;
  command: string;
  next_occurrence: string | null;
  created_at: string;
}

export function toOutputRowFromLocal(row: LocalScheduleRecord): OutputRow {
  return {
    origin: "local",
    id: row.id,
    name: row.name ?? null,
    status: row.status,
    timezone: row.timezone,
    rrule: row.rrule,
    target: row.command,
    next_occurrence: row.next_occurrence,
    created_at: row.created_at,
  };
}

export function toOutputRowFromCloud(schedule: CloudSchedule): OutputRow {
  const rruleField = schedule.rrule;
  const rrule =
    typeof rruleField === "string"
      ? rruleField
      : typeof rruleField === "object" && rruleField !== null
        ? (rruleField.rule ?? "")
        : "";

  return {
    origin: "cloud",
    id: String(schedule.id ?? ""),
    status: String(schedule.status ?? ""),
    timezone: String(schedule.timezone ?? ""),
    rrule,
    target: String(schedule.webhook?.url ?? ""),
    next_occurrence: (schedule.next_occurrence ?? null) as string | null,
    created_at: (schedule.created_at ?? null) as string | null,
  };
}

export function output(payload: unknown, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (typeof payload === "object" && payload !== null) {
    for (const [key, value] of Object.entries(payload)) {
      const rendered = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      console.log(`${pc.cyan(key)}: ${rendered}`);
    }
    return;
  }

  console.log(String(payload));
}

export function outputList(rows: OutputRow[], jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(pc.dim("No schedules found."));
    return;
  }

  if (shouldUseCompactListLayout()) {
    outputListCompact(rows);
    return;
  }

  const table = new Table({
    head: ["Origin", "Id", "Status", "Timezone", "RRule", "Target", "Next occurrence"],
    style: {
      head: ["cyan"],
      border: ["gray"],
      compact: true,
    },
    wordWrap: false,
  });

  for (const row of rows) {
    table.push([
      row.origin,
      formatDisplayId(row.id),
      colorStatus(row.status),
      row.timezone,
      truncateCell(row.rrule, 32),
      truncateCell(row.target || "-", 24),
      formatNextOccurrence(row.next_occurrence, row.status),
    ]);
  }

  console.log(table.toString());
}

export function outputOccurrences(
  payload: { occurrences: string[]; count: number; timezone?: string },
  jsonMode: boolean,
): void {
  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.occurrences.length === 0) {
    console.log(pc.dim("No occurrences found."));
    return;
  }

  if (payload.timezone) {
    console.log(`${pc.cyan("Timezone")}: ${payload.timezone}`);
  }

  const table = new Table({
    head: ["#", "Occurrence (UTC)"],
    style: {
      head: ["cyan"],
      border: ["gray"],
      compact: true,
    },
  });

  payload.occurrences.forEach((occurrence, index) => {
    table.push([String(index + 1), occurrence]);
  });

  console.log(table.toString());
}

function colorStatus(status: string): string {
  if (status === "active" || status === "success") return pc.green(status);
  if (status === "paused") return pc.yellow(status);
  if (status === "failed") return pc.red(status);
  return status;
}

function formatNextOccurrence(nextOccurrence: string | null, status: string): string {
  if (!nextOccurrence) return "none";
  if (status === "paused") return nextOccurrence;
  return nextOccurrence <= new Date().toISOString() ? `due since ${nextOccurrence}` : nextOccurrence;
}

function truncateCell(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function shouldUseCompactListLayout(): boolean {
  if (!process.stdout.isTTY) return false;
  const columns = process.stdout.columns ?? 0;
  return columns > 0 && columns < 150;
}

function outputListCompact(rows: OutputRow[]): void {
  const valueWidth = getCompactValueWidth();

  for (const [index, row] of rows.entries()) {
    console.log(`${pc.cyan("Origin")}: ${row.origin}`);
    console.log(`${pc.cyan("Id")}: ${formatDisplayId(row.id)}`);
    console.log(`${pc.cyan("Status")}: ${row.status}`);
    console.log(`${pc.cyan("Timezone")}: ${row.timezone}`);
    console.log(`${pc.cyan("RRule")}: ${truncateCell(row.rrule, valueWidth)}`);
    console.log(`${pc.cyan("Target")}: ${truncateCell(row.target || "-", valueWidth)}`);
    console.log(
      `${pc.cyan("Next occurrence")}: ${truncateCell(formatNextOccurrence(row.next_occurrence, row.status), valueWidth)}`,
    );

    if (index < rows.length - 1) {
      console.log("");
    }
  }
}

function getCompactValueWidth(): number {
  const columns = process.stdout.columns ?? 120;
  return Math.max(24, columns - 20);
}

function formatDisplayId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}
