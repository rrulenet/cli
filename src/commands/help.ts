import { Command, Help } from "@oclif/core";

export default class HelpCommand extends Command {
  static override summary = "Display help for rrulenet";
  static override strict = false;
  static override examples = [
    "<%= config.bin %> help",
    "<%= config.bin %> help local add",
  ];

  async run(): Promise<void> {
    const help = new Help(this.config, this.config.pjson.oclif.helpOptions ?? this.config.pjson.helpOptions);
    await help.showHelp(this.argv);
  }
}
