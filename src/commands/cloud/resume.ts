import { Args } from "@oclif/core";
import pc from "picocolors";
import { BaseCommand } from "../../base-command.js";
import { cloudResumeSchedule, resolveCloudConfig } from "../../cloud-client.js";
import { output } from "../../lib/output.js";
import { startSpinner } from "../../lib/runtime.js";

export default class CloudResume extends BaseCommand<typeof CloudResume> {
  static override summary = "Resume a cloud schedule";
  static override examples = ["<%= config.bin %> cloud resume sch_123"];

  static override args = {
    id: Args.string({ required: true, description: "Cloud schedule id" }),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const { args } = await this.parse(CloudResume);
    const spinner = startSpinner("Resuming cloud schedule...", this.jsonMode);

    try {
      const schedule = await cloudResumeSchedule(resolveCloudConfig(config), args.id);
      spinner?.success(pc.green("Cloud schedule resumed"));
      output(schedule, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud resume failed"));
      throw error;
    }
  }
}
