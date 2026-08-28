import {Args, Flags} from "@oclif/core";
import pc from "picocolors";
import {BaseCommand} from "../../base-command.js";
import {cloudGetScheduleExecutions, resolveCloudConfig} from "../../cloud-client.js";
import {outputCloudExecutions} from "../../lib/output.js";
import {validateCloudPagination} from "../../lib/pagination.js";
import {startSpinner} from "../../lib/runtime.js";

export default class CloudExecutions extends BaseCommand<typeof CloudExecutions> {
  static override summary = "List executions for a cloud schedule";
  static override examples = [
    "<%= config.bin %> cloud executions abcd1234",
    "<%= config.bin %> cloud executions abcd1234 --limit 25 --offset 25",
    "<%= config.bin %> cloud executions abcd1234 --json",
  ];

  static override args = {
    id: Args.string({required: true, description: "Cloud schedule id or unique prefix"}),
  };

  static override flags = {
    limit: Flags.integer({description: "Maximum executions to return (1-100)"}),
    offset: Flags.integer({description: "Executions to skip (zero or greater)"}),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const {args, flags} = await this.parse(CloudExecutions);
    validateCloudPagination(flags.limit, flags.offset);
    const spinner = startSpinner("Fetching cloud executions...", this.jsonMode);

    try {
      const executions = await cloudGetScheduleExecutions(
        resolveCloudConfig(config),
        args.id,
        {limit: flags.limit, offset: flags.offset},
      );
      spinner?.success(pc.green("Cloud executions fetched"));
      outputCloudExecutions(executions, this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud executions failed"));
      throw error;
    }
  }
}
