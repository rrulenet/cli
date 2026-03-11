import { Args } from "@oclif/core";
import pc from "picocolors";
import { BaseCommand } from "../../base-command.js";
import { cloudPauseSchedule, resolveCloudConfig } from "../../cloud-client.js";
import { output } from "../../lib/output.js";
import { startSpinner } from "../../lib/runtime.js";

export default class CloudPause extends BaseCommand<typeof CloudPause> {
  static override summary = "Pause a cloud schedule";
  static override examples = ["<%= config.bin %> cloud pause sch_123"];

  static override args = {
    id: Args.string({ required: true, description: "Cloud schedule id" }),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const { args } = await this.parse(CloudPause);
    const spinner = startSpinner("Pausing cloud schedule...", this.jsonMode);

    try {
      const schedule = await cloudPauseSchedule(resolveCloudConfig(config), args.id);
      spinner?.success(pc.green("Cloud schedule paused"));
      output(schedule, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud pause failed"));
      throw error;
    }
  }
}
