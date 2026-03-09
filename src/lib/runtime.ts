import pc from "picocolors";
import yoctoSpinner from "yocto-spinner";
import type { CliConfig } from "../config.js";
import { resolveCloudConfig, cloudListSchedules } from "../cloud-client.js";
import { CliError } from "../errors.js";
import { toOutputRowFromCloud, toOutputRowFromLocal, type OutputRow } from "./output.js";

export function validateLocalDriver(config: CliConfig): void {
  const localDriver = config.local?.driver || "sqlite";
  if (localDriver !== "sqlite") {
    throw new CliError(
      `Unsupported local driver '${localDriver}'. Current implementation supports sqlite only.`,
      2,
    );
  }
}

export function startSpinner(text: string, jsonMode: boolean): ReturnType<typeof yoctoSpinner> | null {
  if (jsonMode || !process.stdout.isTTY) return null;
  return yoctoSpinner({text}).start();
}

export async function listCombined(config: CliConfig, origin: "local" | "cloud" | "all", jsonMode: boolean): Promise<OutputRow[]> {
  const rows: OutputRow[] = [];

  if (origin === "all" || origin === "local") {
    const local = await import("../local-store.js");
    const db = local.openLocalStore();
    rows.push(...local.listLocalSchedules(db).map((row) => toOutputRowFromLocal(row)));
  }

  if (origin === "all" || origin === "cloud") {
    const spinner = startSpinner("Fetching cloud schedules...", jsonMode);
    try {
      const cloudRows = await cloudListSchedules(resolveCloudConfig(config));
      spinner?.success(pc.green("Cloud schedules fetched"));
      rows.push(...cloudRows.map((row) => toOutputRowFromCloud(row)));
    } catch (error: unknown) {
      spinner?.error(pc.red("Cloud list failed"));
      if (origin === "cloud") throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.yellow(`Warning: cloud list failed (${message})`));
    }
  }

  return rows;
}
