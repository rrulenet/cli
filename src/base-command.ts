import {Command} from "@oclif/core";
import pc from "picocolors";
import {loadConfig} from "./config.js";
import {isCliError} from "./errors.js";
import {validateLocalDriver} from "./lib/runtime.js";

export abstract class BaseCommand<T extends typeof Command> extends Command {
  static enableJsonFlag = true;

  protected get jsonMode(): boolean {
    return this.jsonEnabled();
  }

  protected getValidatedConfig() {
    const config = loadConfig();
    validateLocalDriver(config);
    return config;
  }

  protected override async catch(error: Error & {exitCode?: number}): Promise<any> {
    if (isCliError(error)) {
      this.error(pc.red(error.message), {exit: error.exitCode});
    }

    const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
    if (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("etimedout")
    ) {
      this.error(pc.red(error.message), {exit: 4});
    }

    return super.catch(error);
  }
}
