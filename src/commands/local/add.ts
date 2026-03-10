import {Args, Flags} from "@oclif/core";
import {BaseCommand} from "../../base-command.js";
import {output} from "../../lib/output.js";
import {CliError} from "../../errors.js";

export default class LocalAdd extends BaseCommand<typeof LocalAdd> {
  static override summary = "Add a local schedule";
  static override strict = false;
  static override examples = [
    '<%= config.bin %> local add "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0" -- echo "sync"',
    '<%= config.bin %> local add "FREQ=WEEKLY;BYDAY=MO;BYHOUR=18;BYMINUTE=0;BYSECOND=0" --timezone Europe/Paris --dtstart 2026-04-06T16:00:00.000Z --name "Monday deploy" -- ./deploy.sh',
  ];

  static override args = {
    rrule: Args.string({required: true, description: "RRule expression"}),
  };

  static override flags = {
    timezone: Flags.string({default: "UTC", description: "IANA timezone"}),
    dtstart: Flags.string({description: "ISO start datetime"}),
    name: Flags.string({description: "Schedule name"}),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const {args, flags} = await this.parse(LocalAdd);
    const local = await import("../../local-store.js");
    const db = local.openLocalStore();

    const raw = process.argv.slice(2);
    const separatorIdx = raw.indexOf("--");
    const command = separatorIdx >= 0 ? raw.slice(separatorIdx + 1).join(" ").trim() : "";
    if (!command) throw new CliError("Missing command after '--' for local add", 2);

    const schedule = local.addLocalSchedule(db, {
      name: flags.name ?? null,
      rrule: args.rrule,
      timezone: flags.timezone,
      dtstart: flags.dtstart ?? new Date().toISOString(),
      command,
    });

    output(schedule, this.jsonMode);
  }
}
