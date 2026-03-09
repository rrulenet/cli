import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LocalConfig {
  driver?: string;
  [key: string]: unknown;
}

export interface CloudConfig {
  api_url?: string;
  url?: string;
  token?: string | null;
  [key: string]: unknown;
}

export interface CliConfig {
  local?: LocalConfig;
  cloud?: CloudConfig;
  [key: string]: unknown;
}

export function getDataDir(): string {
  return process.env.RRULENET_DATA_DIR || join(process.cwd(), ".rrulenet");
}

export function ensureDataDir(): void {
  mkdirSync(getDataDir(), { recursive: true });
}

export function getDbPath(): string {
  return join(getDataDir(), "scheduler.db");
}

export function getConfigPath(): string {
  return join(getDataDir(), "config.json");
}

export function loadConfig(): CliConfig {
  ensureDataDir();
  try {
    const raw = readFileSync(getConfigPath(), "utf8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {
      local: { driver: "sqlite" },
      cloud: { api_url: "https://api.rrule.net", token: null },
    };
  }
}

export function saveConfig(config: CliConfig): void {
  ensureDataDir();
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function setConfigValue(config: CliConfig, key: string, value: unknown): CliConfig {
  const parts = key.split(".");
  let cursor: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const current = cursor[part];
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[parts[parts.length - 1]] = value;
  return config;
}
