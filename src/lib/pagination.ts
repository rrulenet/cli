import { CliError } from "../errors.js";

export function validateCloudPagination(limit?: number, offset?: number): void {
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw new CliError("--limit must be between 1 and 100", 2);
  }
  if (offset !== undefined && offset < 0) {
    throw new CliError("--offset must be zero or greater", 2);
  }
}
