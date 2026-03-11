import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { CliError } from "../../errors.js";
import { output } from "../../lib/output.js";
import { cronToRRule, isValidCronExpression } from "../../cron-utils.js";

export default class ImportCron extends BaseCommand<typeof ImportCron> {
  static override summary = "Convert a cron expression to RRule";
  static override examples = [
    '<%= config.bin %> import cron "0 9 * * 1" --timezone Europe/Paris',
    '<%= config.bin %> import cron "0 0 L * *" --json',
  ];

  static override args = {
    expression: Args.string({ required: true, description: "Cron expression (5 or 6 fields)" }),
  };

  static override flags = {
    timezone: Flags.string({ default: "UTC", description: "IANA timezone for interpreting cron times" }),
  };

  async run(): Promise<void> {
    this.getValidatedConfig();
    const { args, flags } = await this.parse(ImportCron);

    if (!isValidCronExpression(args.expression)) {
      throw new CliError("Invalid cron expression", 2);
    }

    try {
      const converted = cronToRRule(args.expression, flags.timezone);
      output(converted, this.jsonMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError(message, 2);
    }
  }
}
