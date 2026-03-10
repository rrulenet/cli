import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { CliError } from "../errors.js";
import { outputOccurrences } from "../lib/output.js";
import { computeOccurrences, isValidRRule, normalizeDateInput } from "../rrule-utils.js";

export default class Simulate extends BaseCommand<typeof Simulate> {
  static override summary = "Simulate future occurrences for an RRule";

  static override examples = [
    '<%= config.bin %> simulate "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0" --count 5',
    '<%= config.bin %> simulate "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=18;BYMINUTE=30;BYSECOND=0" --dtstart 20260401T120000 --timezone Europe/Paris --count 6 --json',
  ];

  static override args = {
    rrule: Args.string({ required: true, description: "RRule expression" }),
  };

  static override flags = {
    dtstart: Flags.string({ description: "Start datetime. Defaults to now." }),
    timezone: Flags.string({ default: "UTC", description: "IANA timezone" }),
    count: Flags.integer({ default: 10, description: "Number of occurrences to return" }),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const { args, flags } = await this.parse(Simulate);

    if (flags.count < 1 || flags.count > 100) {
      throw new CliError("Invalid count. Use a value between 1 and 100.", 2);
    }

    const dtstart = normalizeDateInput(flags.dtstart ?? new Date().toISOString(), flags.timezone);

    if (!isValidRRule(args.rrule, dtstart, flags.timezone)) {
      throw new CliError("Invalid RRule or no future occurrence", 2);
    }

    const occurrences = computeOccurrences(args.rrule, dtstart, flags.timezone, flags.count);
    outputOccurrences(
      {
        occurrences,
        count: occurrences.length,
        timezone: flags.timezone,
      },
      this.jsonMode,
    );
  }
}
