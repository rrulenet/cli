import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";

export function parseISOToZonedDateTime(
  isoString: string,
  timezone: string,
): Temporal.ZonedDateTime {
  try {
    return Temporal.ZonedDateTime.from(isoString);
  } catch {
    try {
      const instant = Temporal.Instant.from(isoString);
      return instant.toZonedDateTimeISO(timezone);
    } catch {
      const basic = parseBasicDateTime(isoString, timezone);
      if (basic) return basic;

      const parsed = Date.parse(isoString);
      if (!Number.isNaN(parsed)) {
        return Temporal.Instant.fromEpochMilliseconds(parsed).toZonedDateTimeISO(timezone);
      }

      throw new RangeError(`Invalid datetime: ${isoString}`);
    }
  }
}

export function normalizeDateInput(input: string, timezone: string): string {
  return parseISOToZonedDateTime(input, timezone).toInstant().toString();
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

export function computeOccurrences(
  rruleString: string,
  dtstartIso: string,
  timezone: string,
  count: number,
  afterDate?: Date,
): string[] {
  const dtstart = parseISOToZonedDateTime(dtstartIso, timezone);
  const hasFiniteBoundary = /(?:^|;)(COUNT|UNTIL)=/i.test(rruleString);
  const rule = new RRuleTemporal({ rruleString, dtstart });
  const occurrences: Temporal.ZonedDateTime[] = [];

  if (afterDate) {
    const afterZdt = Temporal.Instant.fromEpochMilliseconds(afterDate.getTime()).toZonedDateTimeISO(
      timezone,
    );

    let cursor = afterZdt;
    let windowSeconds = 3600;
    const maxWindowSeconds = 20 * 365 * 24 * 3600;

    while (occurrences.length < count && windowSeconds <= maxWindowSeconds) {
      const beforeZdt = cursor.add({ seconds: windowSeconds });
      const batch = rule.between(cursor, beforeZdt, false);

      if (batch.length === 0) {
        windowSeconds *= 2;
        continue;
      }

      const needed = count - occurrences.length;
      occurrences.push(...batch.slice(0, needed));
      cursor = batch[batch.length - 1];
      windowSeconds = 3600;
    }
  } else if (hasFiniteBoundary) {
    occurrences.push(...rule.all().slice(0, count));
  } else {
    rule.all((zdt) => {
      occurrences.push(zdt);
      return occurrences.length < count;
    });
  }

  return occurrences
    .slice(0, count)
    .map((zdt) => new Date(zdt.epochMilliseconds).toISOString());
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

function parseBasicDateTime(input: string, timezone: string): Temporal.ZonedDateTime | null {
  const match = input.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?(Z)?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, millisecond = "0", zulu] = match;
  const normalizedMilliseconds = millisecond.padEnd(3, "0");

  if (zulu === "Z") {
    const instant = Temporal.Instant.from(
      `${year}-${month}-${day}T${hour}:${minute}:${second}.${normalizedMilliseconds}Z`,
    );
    return instant.toZonedDateTimeISO(timezone);
  }

  const plain = Temporal.PlainDateTime.from(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${normalizedMilliseconds}`,
  );
  return plain.toZonedDateTime(timezone);
}
