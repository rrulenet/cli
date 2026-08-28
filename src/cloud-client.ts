import type { CliConfig } from "./config.js";
import { CliError } from "./errors.js";

export interface ResolvedCloudConfig {
  url: string;
  token: string | null;
}

export type CloudScheduleStatus = "active" | "paused";
export type CloudExecutionStatus = "sending" | "success" | "failed" | "skipped";

export interface CloudScheduleInput {
  type: "rrule" | "cron" | "natural" | "recurrence";
  value: string;
  language?: string;
}

export interface CloudSchedulePauseContext {
  reason: "manual" | "delivery_failure" | "completed" | "unknown";
  paused_at: string;
  execution?: {
    id: string;
    response_code: number | null;
    target?: {
      id: string;
      label: string | null;
      timezone: string | null;
    };
  };
}

export interface CloudScheduleTarget {
  id: string;
  label: string;
  timezone: string;
  recurrence: unknown | null;
  event_schedule?: unknown | null;
  metadata: Record<string, unknown>;
}

export interface CloudScheduleExecutionSummary {
  scheduled_for: string;
  status: CloudExecutionStatus;
  response_code: number | null;
}

export interface CloudSchedule {
  id: string;
  user_id?: string;
  name?: string | null;
  status: CloudScheduleStatus | string;
  pause_context?: CloudSchedulePauseContext | null;
  timezone: string;
  input?: CloudScheduleInput;
  recurrence?: unknown | null;
  event_schedule?: unknown | null;
  targets?: CloudScheduleTarget[];
  explanation?: {
    text: string;
    confidence: number;
    ambiguities: string[];
  };
  webhook?: { url: string } | null;
  last_occurrence?: string | null;
  next_occurrence?: string | null;
  recent_executions?: CloudScheduleExecutionSummary[];
  created_at?: string | null;
  updated_at?: string | null;
  // Kept for compatibility with responses from the first cloud API contract.
  rrule?: string | { rule?: string };
  [key: string]: unknown;
}

export interface CloudScheduleExecution {
  execution_id: string;
  schedule_id: string;
  scheduled_for: string;
  executed_at: string;
  status: CloudExecutionStatus;
  response_code: number | null;
  response_body: string | null;
  target?: {
    id: string;
    label: string | null;
    timezone: string | null;
    metadata: Record<string, unknown> | null;
  };
}

export interface CloudScheduleExecutions {
  executions: CloudScheduleExecution[];
  count: number;
}

export interface CloudListOptions {
  status?: CloudScheduleStatus;
  limit?: number;
  offset?: number;
}

export interface CloudPaginationOptions {
  limit?: number;
  offset?: number;
}

export function resolveCloudConfig(config: CliConfig): ResolvedCloudConfig {
  return {
    url:
      process.env.RRULENET_API_BASE_URL ||
      config.cloud?.api_url ||
      config.cloud?.url ||
      "https://api.rrule.net",
    token: process.env.RRULENET_TOKEN || config.cloud?.token || null,
  };
}

export async function cloudAddSchedule(
  cloud: ResolvedCloudConfig,
  input: { input: string; timezone: string; webhook: string },
): Promise<CloudSchedule> {
  const body = await cloudRequest(cloud, "/v1/schedules", "Cloud add failed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.input,
      timezone: input.timezone,
      webhook: { url: input.webhook },
    }),
  });

  return extractSchedule(body);
}

export async function cloudListSchedules(
  cloud: ResolvedCloudConfig,
  options: CloudListOptions = {},
): Promise<CloudSchedule[]> {
  const body = await cloudRequest(
    cloud,
    withQuery("/v1/schedules", options),
    "Cloud list failed",
  );

  if (Array.isArray(body)) return body as CloudSchedule[];
  if (isObject(body) && Array.isArray(body.schedules)) {
    return body.schedules as CloudSchedule[];
  }
  return [];
}

export async function cloudGetSchedule(
  cloud: ResolvedCloudConfig,
  id: string,
): Promise<CloudSchedule> {
  const body = await cloudRequest(
    cloud,
    `/v1/schedules/${encodeURIComponent(id)}`,
    "Cloud get failed",
  );

  return extractSchedule(body);
}

export async function cloudGetScheduleExecutions(
  cloud: ResolvedCloudConfig,
  id: string,
  options: CloudPaginationOptions = {},
): Promise<CloudScheduleExecutions> {
  const body = await cloudRequest(
    cloud,
    withQuery(`/v1/schedules/${encodeURIComponent(id)}/executions`, options),
    "Cloud executions failed",
  );

  if (isObject(body) && Array.isArray(body.executions)) {
    return {
      executions: body.executions as CloudScheduleExecution[],
      count: typeof body.count === "number" ? body.count : body.executions.length,
    };
  }

  return { executions: [], count: 0 };
}

export async function cloudPauseSchedule(cloud: ResolvedCloudConfig, id: string): Promise<CloudSchedule> {
  return cloudScheduleAction(cloud, id, "pause", "Cloud pause failed");
}

export async function cloudResumeSchedule(cloud: ResolvedCloudConfig, id: string): Promise<CloudSchedule> {
  return cloudScheduleAction(cloud, id, "resume", "Cloud resume failed");
}

export async function cloudRemoveSchedule(cloud: ResolvedCloudConfig, id: string): Promise<{ id: string; removed: true }> {
  await cloudRequest(
    cloud,
    `/v1/schedules/${encodeURIComponent(id)}`,
    "Cloud remove failed",
    { method: "DELETE" },
    false,
  );

  return { id, removed: true };
}

async function cloudScheduleAction(
  cloud: ResolvedCloudConfig,
  id: string,
  action: "pause" | "resume",
  errorPrefix: string,
): Promise<CloudSchedule> {
  const body = await cloudRequest(
    cloud,
    `/v1/schedules/${encodeURIComponent(id)}/${action}`,
    errorPrefix,
    { method: "POST" },
  );

  return extractSchedule(body);
}

async function cloudRequest(
  cloud: ResolvedCloudConfig,
  path: string,
  errorPrefix: string,
  init: RequestInit = {},
  parseResponse = true,
): Promise<unknown> {
  if (!cloud.token) {
    throw new CliError(
      "Missing cloud token. Set RRULENET_TOKEN or rrulenet config set cloud.token <token>",
      3,
    );
  }

  const res = await fetch(`${cloud.url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cloud.token}`,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    const exitCode = mapCloudStatusToExitCode(res.status);
    throw new CliError(`${errorPrefix} (${res.status}): ${JSON.stringify(body)}`, exitCode);
  }

  if (!parseResponse || res.status === 204) return undefined;
  return res.json();
}

function extractSchedule(body: unknown): CloudSchedule {
  if (isObject(body) && isObject(body.schedule)) {
    return body.schedule as CloudSchedule;
  }
  return body as CloudSchedule;
}

function withQuery(path: string, options: CloudPaginationOptions & { status?: CloudScheduleStatus }): string {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return { error: "invalid_json_response" };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapCloudStatusToExitCode(status: number): number {
  if (status === 401 || status === 403) return 3;
  if (status === 400 || status === 404 || status === 409 || status === 422) return 2;
  return 4;
}
