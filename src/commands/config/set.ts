import {Args} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {loadConfig, saveConfig, setConfigValue} from "../../config.js";
import {output} from "../../lib/output.js";

export default class ConfigSet extends BaseCommand<typeof ConfigSet> {
  static override summary = "Set config value";

  static override args = {
    key: Args.string({required: true, description: "Config path (dot notation)"}),
    value: Args.string({required: true, description: "Config value"}),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const {args} = await this.parse(ConfigSet);
    const config = loadConfig();
    const normalizedValue = args.value === "null" ? null : args.value;
    saveConfig(setConfigValue(config, args.key, normalizedValue));
    output({ok: true, key: args.key, value: normalizedValue}, this.jsonMode);
  }
}
