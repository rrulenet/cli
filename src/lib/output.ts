import pc from "picocolors";
import Table from "cli-table3";
import type { CloudSchedule } from "../cloud-client.js";

export interface OutputRow {
  origin: "local" | "cloud";
  id: string;
  status: string;
  timezone: string;
  rrule: string;
  target: string;
  next_occurrence: string | null;
  created_at: string | null;
}

export interface LocalScheduleRecord {
  id: string;
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

  const table = new Table({
    head: ["Origin", "Id", "Status", "Timezone", "RRule", "Target", "Next occurrence"],
    style: {
      head: ["cyan"],
      border: ["gray"],
      compact: true,
    },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push([
      row.origin,
      row.id,
      colorStatus(row.status),
      row.timezone,
      row.rrule,
      row.target || "-",
      row.next_occurrence || "none",
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
