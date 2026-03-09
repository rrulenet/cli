import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";

export function parseISOToZonedDateTime(
  isoString: string,
  timezone: string,
): Temporal.ZonedDateTime {
  try {
    return Temporal.ZonedDateTime.from(isoString);
  } catch {
    const instant = Temporal.Instant.from(isoString);
    return instant.toZonedDateTimeISO(timezone);
  }
}

export function computeNextOccurrence(
  rruleString: string,
  dtstartIso: string,
  timezone: string,
  afterDate: Date,
): string | null {
  const dtstart = parseISOToZonedDateTime(dtstartIso, timezone);
  const rule = new RRuleTemporal({ rruleString, dtstart });
  const afterZdt = Temporal.Instant.fromEpochMilliseconds(afterDate.getTime()).toZonedDateTimeISO(
    timezone,
  );

  let windowSeconds = 3600;
  const maxWindowSeconds = 20 * 365 * 24 * 3600;
  while (windowSeconds <= maxWindowSeconds) {
    const beforeZdt = afterZdt.add({ seconds: windowSeconds });
    const batch = rule.between(afterZdt, beforeZdt, false);
    if (batch.length > 0) {
      return new Date(batch[0].epochMilliseconds).toISOString();
    }
    windowSeconds *= 2;
  }
  return null;
}

export function isValidRRule(rruleString: string, dtstartIso: string, timezone: string): boolean {
  try {
    const dtstart = parseISOToZonedDateTime(dtstartIso, timezone);
    const rule = new RRuleTemporal({ rruleString, dtstart });
    const probe = rule.between(dtstart, dtstart.add({ years: 20 }), true);
    return probe.length > 0;
  } catch {
    return false;
  }
}
