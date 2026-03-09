import {Args} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {output} from "../../lib/output.js";
import {CliError} from "../../errors.js";

export default class LocalRemove extends BaseCommand<typeof LocalRemove> {
  static override summary = "Remove a local schedule";

  static override args = {
    id: Args.string({required: true, description: "Schedule id"}),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const {args} = await this.parse(LocalRemove);
    const local = await import("../../local-store.js");
    const db = local.openLocalStore();
    const ok = local.removeLocalSchedule(db, args.id);
    if (!ok) throw new CliError(`Local schedule not found: ${args.id}`, 2);
    output({id: args.id, removed: true}, this.jsonMode);
  }
}
