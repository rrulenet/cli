import pc from "picocolors";
import {Flags} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {
  cloudListSchedules,
  resolveCloudConfig,
  type CloudScheduleStatus,
} from "../../cloud-client.js";
import {outputList, toOutputRowFromCloud} from "../../lib/output.js";
import {validateCloudPagination} from "../../lib/pagination.js";
import {startSpinner} from "../../lib/runtime.js";

export default class CloudList extends BaseCommand<typeof CloudList> {
  static override summary = "List cloud schedules";
  static override examples = [
    "<%= config.bin %> cloud list",
    "<%= config.bin %> cloud list --status active --limit 25",
    "<%= config.bin %> cloud list --offset 100 --limit 100",
    "<%= config.bin %> cloud list --json",
  ];

  static override flags = {
    status: Flags.string({
      description: "Filter by schedule status",
      options: ["active", "paused"],
    }),
    limit: Flags.integer({description: "Maximum schedules to return (1-100)"}),
    offset: Flags.integer({description: "Schedules to skip (zero or greater)"}),
  };

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const {flags} = await this.parse(CloudList);
    validateCloudPagination(flags.limit, flags.offset);
    const spinner = startSpinner("Fetching cloud schedules...", this.jsonMode);

    try {
      const schedules = await cloudListSchedules(resolveCloudConfig(config), {
        status: flags.status as CloudScheduleStatus | undefined,
        limit: flags.limit,
        offset: flags.offset,
      });
      spinner?.success(pc.green("Cloud schedules fetched"));
      outputList(schedules.map((schedule) => toOutputRowFromCloud(schedule)), this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud list failed"));
      throw error;
    }
  }
}
