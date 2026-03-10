import {BaseCommand} from "../../base-command.js";
import {outputList, toOutputRowFromLocal} from "../../lib/output.js";

export default class LocalList extends BaseCommand<typeof LocalList> {
  static override summary = "List local schedules";
  static override examples = [
    "<%= config.bin %> local list",
    "<%= config.bin %> local list --json",
  ];

  async run(): Promise<void> {
    this.getValidatedConfig();
    const local = await import("../../local-store.js");
    const db = local.openLocalStore();
    const rows = local.listLocalSchedules(db).map((row) => toOutputRowFromLocal(row));
    outputList(rows, this.jsonMode);
  }
}
