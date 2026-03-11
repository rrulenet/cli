import {Args} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {output} from "../../lib/output.js";
import {CliError} from "../../errors.js";

export default class LocalPause extends BaseCommand<typeof LocalPause> {
  static override summary = "Pause a local schedule";
  static override examples = ["<%= config.bin %> local pause 2f6de5f1-6b29-4f18-88fb-68ac7c4b3e31"];

  static override args = {
    id: Args.string({required: true, description: "Schedule id"}),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const {args} = await this.parse(LocalPause);
    const local = await import("../../local-store.js");
    const db = local.openLocalStore();
    const resolved = local.resolveLocalScheduleId(db, args.id);
    if (resolved.ambiguous) throw new CliError(`Ambiguous local schedule id: ${args.id}. Use a longer prefix.`, 2);
    if (!resolved.id) throw new CliError(`Local schedule not found: ${args.id}`, 2);
    const ok = local.updateLocalStatus(db, resolved.id, "paused");
    if (!ok) throw new CliError(`Local schedule not found: ${args.id}`, 2);
    output({id: resolved.id, status: "paused"}, this.jsonMode);
  }
}
