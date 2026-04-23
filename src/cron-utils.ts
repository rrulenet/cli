import { Temporal } from "temporal-polyfill";

export interface CronToRRuleResult {
  rrule: string;
  dtstart: string;
  timezone: string;
  warnings?: string[];
}

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  second?: Set<number>;
  hasLastDay?: boolean;
  hasNthWeekday?: Map<number, number>;
}

export function cronToRRule(cronExpression: string, timezone: string): CronToRRuleResult {
  if (hasWeekdayModifier(cronExpression)) {
    throw new Error(
      "Cron pattern with 'W' (weekday nearest) is not supported. Use explicit weekdays instead.",
    );
  }

  const fields = parseCronExpression(cronExpression);
  const warnings: string[] = [];
  const freq = determineFrequency(fields);
  const parts = [`FREQ=${freq}`];
  const byParts: Record<string, string> = {};
  let interval: number | undefined;

  if (fields.minute.size === 60 && freq === "HOURLY") {
    interval = 1;
  } else if (fields.minute.size > 0 && fields.minute.size < 60) {
    const minuteInterval = detectInterval(fields.minute, 59);
    if (minuteInterval && freq === "HOURLY") {
      interval = minuteInterval;
    } else {
      byParts.BYMINUTE = formatNumberSet(fields.minute);
    }
  }

  if (fields.hour.size > 0 && fields.hour.size < 24) {
    const hourInterval = detectInterval(fields.hour, 23);
    if (hourInterval && freq === "DAILY") {
      interval = hourInterval;
    } else {
      byParts.BYHOUR = formatNumberSet(fields.hour);
    }
  }

  if (fields.second && fields.second.size > 0 && fields.second.size < 60) {
    byParts.BYSECOND = formatNumberSet(fields.second);
  }

  if (fields.dayOfMonth.size > 0) {
    byParts.BYMONTHDAY = formatNumberSet(fields.dayOfMonth);
  }

  if (fields.hasNthWeekday && fields.hasNthWeekday.size > 0) {
    const entries = Array.from(fields.hasNthWeekday.entries());
    const [cronDay, nth] = entries[0];
    byParts.BYDAY = convertCronDayToRRule(cronDay);
    byParts.BYSETPOS = String(nth);

    if (entries.length > 1) {
      warnings.push("Multiple nth weekday patterns detected; only the first one is used.");
    }
  } else if (fields.dayOfWeek.size > 0 && fields.dayOfWeek.size < 7) {
    byParts.BYDAY = Array.from(fields.dayOfWeek)
      .sort((a, b) => a - b)
      .map(convertCronDayToRRule)
      .join(",");
  }

  if (fields.month.size > 0 && fields.month.size < 12) {
    byParts.BYMONTH = formatNumberSet(fields.month);
  }

  if (interval !== undefined) parts.push(`INTERVAL=${interval}`);
  for (const key of ["BYMONTH", "BYMONTHDAY", "BYDAY", "BYHOUR", "BYMINUTE", "BYSECOND", "BYSETPOS"]) {
    if (byParts[key]) parts.push(`${key}=${byParts[key]}`);
  }

  const rrule = parts.join(";");
  const dtstart = Temporal.Now.zonedDateTimeISO(timezone).toInstant().toString();

  return {
    rrule,
    dtstart,
    timezone,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function isValidCronExpression(cronExpression: string): boolean {
  try {
    parseCronExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

function hasWeekdayModifier(cronExpression: string): boolean {
  return /\d+W|LW/i.test(cronExpression);
}

function parseCronExpression(cronExpression: string): CronFields {
  const trimmed = cronExpression.trim();
  const fields = trimmed.split(/\s+/);

  if (fields.length < 5 || fields.length > 6) {
    throw new Error(`Invalid cron expression: expected 5-6 fields, got ${fields.length}`);
  }

  const result: CronFields = {
    minute: new Set<number>(),
    hour: new Set<number>(),
    dayOfMonth: new Set<number>(),
    month: new Set<number>(),
    dayOfWeek: new Set<number>(),
  };

  const is6Field = fields.length === 6;
  const offset = is6Field ? 1 : 0;

  if (is6Field) {
    result.second = parseField(fields[0], 0, 59);
  }

  result.minute = parseField(fields[0 + offset], 0, 59);
  result.hour = parseField(fields[1 + offset], 0, 23);

  const dayOfMonthField = fields[2 + offset];
  if (dayOfMonthField.toUpperCase().includes("L")) {
    result.hasLastDay = true;
    const match = dayOfMonthField.match(/L-(\d+)/i);
    if (match) {
      const daysBeforeLast = parseInt(match[1], 10);
      result.dayOfMonth.add(-(daysBeforeLast + 1));
    } else {
      result.dayOfMonth.add(-1);
    }
  } else if (dayOfMonthField !== "*" && dayOfMonthField !== "?") {
    result.dayOfMonth = parseField(dayOfMonthField, 1, 31);
  }

  if (fields[3 + offset] !== "*" && fields[3 + offset] !== "?") {
    result.month = parseField(fields[3 + offset], 1, 12);
  }

  const dayOfWeekField = fields[4 + offset];
  if (dayOfWeekField.includes("#")) {
    result.hasNthWeekday = new Map();
    const parts = dayOfWeekField.split(",");
    for (const part of parts) {
      const match = part.match(/(\d+)#(-?\d+)/);
      if (!match) continue;
      let day = parseInt(match[1], 10);
      const nth = parseInt(match[2], 10);
      if (day === 7) day = 0;
      result.hasNthWeekday.set(day, nth);
    }
  } else if (dayOfWeekField !== "*" && dayOfWeekField !== "?") {
    const days = parseField(dayOfWeekField, 0, 7);
    days.forEach((day) => {
      result.dayOfWeek.add(day === 7 ? 0 : day);
    });
  }

  return result;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  if (field === "*") {
    for (let i = min; i <= max; i += 1) result.add(i);
    return result;
  }

  if (field.includes("/")) {
    const [range, step] = field.split("/");
    const stepValue = parseInt(step, 10);

    if (range === "*") {
      for (let i = min; i <= max; i += stepValue) result.add(i);
    } else if (range.includes("-")) {
      const [start, end] = range.split("-").map((n) => parseInt(n, 10));
      for (let i = start; i <= end; i += stepValue) result.add(i);
    }

    return result;
  }

  for (const part of field.split(",")) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((n) => parseInt(n, 10));
      for (let i = start; i <= end; i += 1) result.add(i);
    } else {
      result.add(parseInt(part, 10));
    }
  }

  return result;
}

function determineFrequency(fields: CronFields): string {
  if (fields.month.size > 0 && fields.month.size < 12) return "YEARLY";
  if (fields.hasNthWeekday && fields.hasNthWeekday.size > 0) return "MONTHLY";
  if (fields.dayOfWeek.size > 0 && fields.dayOfWeek.size < 7) return "WEEKLY";
  if ((fields.dayOfMonth.size > 0 && fields.dayOfMonth.size < 31) || fields.hasLastDay) {
    return "MONTHLY";
  }
  if (fields.hour.size > 0 && fields.hour.size < 24) return "DAILY";
  if (fields.minute.size > 0) return "HOURLY";
  return "DAILY";
}

function detectInterval(values: Set<number>, max: number): number | undefined {
  if (values.size === 0 || values.size === max + 1) return undefined;
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length < 2) return undefined;

  const interval = sorted[1] - sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] !== interval) return undefined;
  }

  return interval;
}

function convertCronDayToRRule(cronDay: number): string {
  const mapping = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return mapping[cronDay];
}

function formatNumberSet(values: Set<number>): string {
  return Array.from(values).sort((a, b) => a - b).join(",");
}
