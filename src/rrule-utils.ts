import { Temporal } from "temporal-polyfill";
import { parse as parseRecurrence } from "@rrulenet/recurrence";

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

function createRule(rruleString: string, dtstartIso: string, timezone: string) {
  const dtstart = parseISOToZonedDateTime(dtstartIso, timezone);
  return parseRecurrence({
    rruleString,
    start: dtstart.toInstant(),
    tzid: timezone,
    cache: true,
  });
}

export function computeNextOccurrence(
  rruleString: string,
  dtstartIso: string,
  timezone: string,
  afterDate: Date,
): string | null {
  const rule = createRule(rruleString, dtstartIso, timezone);
  const next = rule.after(afterDate, false);
  return next ? toIsoInstant(next) : null;
}

export function computeOccurrences(
  rruleString: string,
  dtstartIso: string,
  timezone: string,
  count: number,
  afterDate?: Date,
): string[] {
  const rule = createRule(rruleString, dtstartIso, timezone);
  const hasFiniteBoundary = /(?:^|;)(COUNT|UNTIL)=/i.test(rruleString);
  const occurrences: Temporal.ZonedDateTime[] = [];

  if (afterDate) {
    let cursor: Date | Temporal.ZonedDateTime = afterDate;
    while (occurrences.length < count) {
      const next = rule.after(cursor, false);
      if (!next) break;
      occurrences.push(next);
      cursor = next;
    }
  } else if (hasFiniteBoundary) {
    occurrences.push(...rule.all().slice(0, count));
  } else {
    rule.all((date) => {
      occurrences.push(date);
      return occurrences.length < count;
    });
  }

  return occurrences.slice(0, count).map(toIsoInstant);
}

function toIsoInstant(date: Temporal.ZonedDateTime): string {
  return new Date(date.epochMilliseconds).toISOString();
}

export function isValidRRule(rruleString: string, dtstartIso: string, timezone: string): boolean {
  try {
    if (!/(?:^|;)FREQ=/.test(rruleString.toUpperCase())) {
      return false;
    }
    const dtstart = parseISOToZonedDateTime(dtstartIso, timezone);
    const firstProbeDate = new Date(dtstart.epochMilliseconds - 1);
    return computeNextOccurrence(rruleString, dtstartIso, timezone, firstProbeDate) !== null;
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
