import {Flags} from "@oclif/core";
import {BaseCommand} from "../base-command.js";
import {outputList} from "../lib/output.js";
import {listCombined} from "../lib/runtime.js";

export default class List extends BaseCommand<typeof List> {
  static override summary = "List schedules from local/cloud/all";

  static override flags = {
    origin: Flags.string({
      description: "Data source",
      options: ["local", "cloud", "all"],
      default: "all",
    }),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const {flags} = await this.parse(List);
    const origin = (flags.origin ?? "all") as "local" | "cloud" | "all";
    const rows = await listCombined(config, origin, this.jsonMode);
    outputList(rows, this.jsonMode);
  }
}
