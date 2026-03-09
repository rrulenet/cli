import type { CliConfig } from "./config.js";
import { CliError } from "./errors.js";

export interface ResolvedCloudConfig {
  url: string;
  token: string | null;
}

export interface CloudSchedule {
  id: string;
  status: string;
  timezone: string;
  rrule?: string | { rule?: string };
  webhook?: { url?: string };
  next_occurrence?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
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
  input: { rrule: string; timezone: string; webhook: string },
): Promise<CloudSchedule> {
  if (!cloud.token) {
    throw new CliError(
      "Missing cloud token. Set RRULENET_TOKEN or rrulenet config set cloud.token <token>",
      3,
    );
  }

  const payload = {
    input: input.rrule,
    timezone: input.timezone,
    webhook: { url: input.webhook },
  };

  const res = await fetch(`${cloud.url}/v1/schedules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cloud.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await safeJson(res);
    const exitCode = res.status === 401 || res.status === 403 ? 3 : 4;
    throw new CliError(`Cloud add failed (${res.status}): ${JSON.stringify(body)}`, exitCode);
  }

  const body = (await res.json()) as unknown;
  if (isObject(body) && isObject(body.schedule)) {
    return body.schedule as CloudSchedule;
  }
  return body as CloudSchedule;
}

export async function cloudListSchedules(cloud: ResolvedCloudConfig): Promise<CloudSchedule[]> {
  if (!cloud.token) {
    throw new CliError(
      "Missing cloud token. Set RRULENET_TOKEN or rrulenet config set cloud.token <token>",
      3,
    );
  }

  const res = await fetch(`${cloud.url}/v1/schedules`, {
    headers: {
      Authorization: `Bearer ${cloud.token}`,
    },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    const exitCode = res.status === 401 || res.status === 403 ? 3 : 4;
    throw new CliError(`Cloud list failed (${res.status}): ${JSON.stringify(body)}`, exitCode);
  }

  const body = (await res.json()) as CloudSchedule[] | { schedules?: CloudSchedule[] };
  if (Array.isArray(body)) return body;
  return body.schedules || [];
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
