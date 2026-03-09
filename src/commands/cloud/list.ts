import pc from "picocolors";
import {BaseCommand} from "../../base-command.js";
import {cloudListSchedules, resolveCloudConfig} from "../../cloud-client.js";
import {outputList, toOutputRowFromCloud} from "../../lib/output.js";
import {startSpinner} from "../../lib/runtime.js";

export default class CloudList extends BaseCommand<typeof CloudList> {
  static override summary = "List cloud schedules";

  async run(): Promise<void> {
    const config = this.getValidatedConfig();
    const spinner = startSpinner("Fetching cloud schedules...", this.jsonMode);

    try {
      const schedules = await cloudListSchedules(resolveCloudConfig(config));
      spinner?.success(pc.green("Cloud schedules fetched"));
      outputList(schedules.map((schedule) => toOutputRowFromCloud(schedule)), this.jsonMode);
    } catch (error) {
      spinner?.error(pc.red("Cloud list failed"));
      throw error;
    }
  }
}
