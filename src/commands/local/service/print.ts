import { Flags } from "@oclif/core";
import { BaseCommand } from "../../../base-command.js";
import { getDataDir } from "../../../config.js";
import { renderServiceTemplate } from "../../../service-templates.js";

export default class LocalServicePrint extends BaseCommand<typeof LocalServicePrint> {
  static override summary = "Print a background service template for the local runner";
  static override examples = [
    "<%= config.bin %> local service print --target launchd",
    "<%= config.bin %> local service print --target systemd-user --interval-ms 5000",
  ];

  static override flags = {
    target: Flags.string({
      required: true,
      options: ["launchd", "systemd-user"],
      description: "Service manager target",
    }),
    "interval-ms": Flags.integer({
      default: 5000,
      description: "Polling interval for the generated runner service",
    }),
    label: Flags.string({
      description: "Service label/unit name override",
    }),
    "data-dir": Flags.string({
      description: "Override RRULENET_DATA_DIR in the generated template",
    }),
    bin: Flags.string({
      description: "Override rrulenet binary path in the generated template",
    }),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const { flags } = await this.parse(LocalServicePrint);
    const target = flags.target as "launchd" | "systemd-user";
    const rrulenetBin = flags.bin ?? "rrulenet";
    const dataDir = flags["data-dir"] ?? getDataDir();
    const label = flags.label ?? defaultServiceLabel(target);

    const rendered = renderServiceTemplate({
      target,
      rrulenetBin,
      dataDir,
      intervalMs: flags["interval-ms"],
      label,
    });

    process.stdout.write(rendered);
  }
}

function defaultServiceLabel(target: "launchd" | "systemd-user"): string {
  if (target === "launchd") return "net.rrule.local-runner";
  return "rrulenet-local-runner";
}
