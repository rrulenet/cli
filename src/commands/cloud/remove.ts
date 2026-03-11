import { Args } from "@oclif/core";
import pc from "picocolors";
import { BaseCommand } from "../../base-command.js";
import { cloudRemoveSchedule, resolveCloudConfig } from "../../cloud-client.js";
import { output } from "../../lib/output.js";
import { startSpinner } from "../../lib/runtime.js";

export default class CloudRemove extends BaseCommand<typeof CloudRemove> {
  static override summary = "Remove a cloud schedule";
  static override examples = ["<%= config.bin %> cloud remove sch_123"];

  static override args = {
    id: Args.string({ required: true, description: "Cloud schedule id" }),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const { args } = await this.parse(CloudRemove);
    const spinner = startSpinner("Removing cloud schedule...", this.jsonMode);

    try {
      const result = await cloudRemoveSchedule(resolveCloudConfig(config), args.id);
      spinner?.success(pc.green("Cloud schedule removed"));
      output(result, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud remove failed"));
      throw error;
    }
  }
}
