import {Args} from "@oclif/core";
import pc from "picocolors";
import {BaseCommand} from "../../base-command.js";
import {cloudGetSchedule, resolveCloudConfig} from "../../cloud-client.js";
import {outputCloudSchedule} from "../../lib/output.js";
import {startSpinner} from "../../lib/runtime.js";

export default class CloudGet extends BaseCommand<typeof CloudGet> {
  static override summary = "Show a cloud schedule";
  static override examples = [
    "<%= config.bin %> cloud get abcd1234",
    "<%= config.bin %> cloud get abcd1234 --json",
  ];

  static override args = {
    id: Args.string({required: true, description: "Cloud schedule id or unique prefix"}),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const {args} = await this.parse(CloudGet);
    const spinner = startSpinner("Fetching cloud schedule...", this.jsonMode);

    try {
      const schedule = await cloudGetSchedule(resolveCloudConfig(config), args.id);
      spinner?.success(pc.green("Cloud schedule fetched"));
      outputCloudSchedule(schedule, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud get failed"));
      throw error;
    }
  }
}
