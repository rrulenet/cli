import {Args} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {loadConfig} from "../../config.js";
import {output} from "../../lib/output.js";

export default class ConfigGet extends BaseCommand<typeof ConfigGet> {
  static override summary = "Get config";
  static override examples = [
    "<%= config.bin %> config get",
    "<%= config.bin %> config get cloud.api_url",
  ];

  static override args = {
    key: Args.string({required: false, description: "Config path (dot notation)"}),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const {args} = await this.parse(ConfigGet);
    const config = loadConfig();

    if (!args.key) {
      output(config, this.jsonMode);
      return;
    }

    const value = args.key
      .split(".")
      .reduce(
        (acc: unknown, part: string) =>
          typeof acc === "object" && acc !== null ? (acc as Record<string, unknown>)[part] : undefined,
        config,
      );

    output({key: args.key, value}, this.jsonMode);
  }
}
