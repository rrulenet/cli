import {Args, Flags} from "@oclif/core";
import pc from "picocolors";
import {BaseCommand} from "../../base-command.js";
import {cloudAddSchedule, resolveCloudConfig} from "../../cloud-client.js";
import {output} from "../../lib/output.js";
import {startSpinner} from "../../lib/runtime.js";

export default class CloudAdd extends BaseCommand<typeof CloudAdd> {
  static override summary = "Create a cloud schedule";

  static override args = {
    rrule: Args.string({required: true, description: "RRule expression"}),
  };

  static override flags = {
    timezone: Flags.string({default: "UTC", description: "IANA timezone"}),
    webhook: Flags.string({required: true, description: "Webhook URL"}),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const {args, flags} = await this.parse(CloudAdd);
    const spinner = startSpinner("Creating cloud schedule...", this.jsonMode);

    try {
      const schedule = await cloudAddSchedule(resolveCloudConfig(config), {
        rrule: args.rrule,
        timezone: flags.timezone,
        webhook: flags.webhook,
      });
      spinner?.success(pc.green("Cloud schedule created"));
      output(schedule, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud schedule creation failed"));
      throw error;
    }
  }
}
