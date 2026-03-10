import test from "node:test";
import assert from "node:assert/strict";
import { computeNextOccurrence } from "../dist/rrule-utils.js";

const cases = [
  {
    name: "Europe/Paris daily 09:00 stays at local time across DST start",
    timezone: "Europe/Paris",
    dtstart: "2026-03-27T08:00:00.000Z",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-03-28T12:00:00.000Z",
    expected: "2026-03-29T07:00:00.000Z",
  },
  {
    name: "Europe/Paris daily 09:00 stays at local time across DST end",
    timezone: "Europe/Paris",
    dtstart: "2026-10-23T07:00:00.000Z",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-10-24T12:00:00.000Z",
    expected: "2026-10-25T08:00:00.000Z",
  },
  {
    name: "America/New_York daily 09:00 stays at local time across DST start",
    timezone: "America/New_York",
    dtstart: "2026-03-06T14:00:00.000Z",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-03-07T15:00:00.000Z",
    expected: "2026-03-08T13:00:00.000Z",
  },
  {
    name: "America/New_York daily 09:00 stays at local time across DST end",
    timezone: "America/New_York",
    dtstart: "2026-10-30T13:00:00.000Z",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-10-31T15:00:00.000Z",
    expected: "2026-11-01T14:00:00.000Z",
  },
  {
    name: "Asia/Tokyo daily 09:00 is stable without DST",
    timezone: "Asia/Tokyo",
    dtstart: "2026-04-01T00:00:00.000Z",
    rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-04-01T12:00:00.000Z",
    expected: "2026-04-02T00:00:00.000Z",
  },
  {
    name: "Monthly BYMONTHDAY=31 skips shorter months",
    timezone: "UTC",
    dtstart: "2026-01-31T10:00:00.000Z",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=10;BYMINUTE=0;BYSECOND=0",
    after: "2026-01-31T12:00:00.000Z",
    expected: "2026-03-31T10:00:00.000Z",
  },
  {
    name: "Monthly first Monday resolves correctly",
    timezone: "Europe/Paris",
    dtstart: "2026-01-05T09:00:00.000Z",
    rrule: "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;BYHOUR=10;BYMINUTE=0;BYSECOND=0",
    after: "2026-02-02T10:30:00.000Z",
    expected: "2026-03-02T09:00:00.000Z",
  },
  {
    name: "Leap day yearly recurrence jumps to next leap year",
    timezone: "UTC",
    dtstart: "2024-02-29T10:00:00.000Z",
    rrule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;BYHOUR=10;BYMINUTE=0;BYSECOND=0",
    after: "2024-03-01T00:00:00.000Z",
    expected: "2028-02-29T10:00:00.000Z",
  },
  {
    name: "End-of-month weekly pattern crosses year boundary",
    timezone: "UTC",
    dtstart: "2026-12-28T18:30:00.000Z",
    rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=18;BYMINUTE=30;BYSECOND=0",
    after: "2026-12-28T19:00:00.000Z",
    expected: "2027-01-04T18:30:00.000Z",
  },
  {
    name: "COUNT-limited rule stops after last occurrence",
    timezone: "UTC",
    dtstart: "2026-04-01T09:00:00.000Z",
    rrule: "FREQ=DAILY;COUNT=3;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-04-03T09:00:01.000Z",
    expected: null,
  },
  {
    name: "UNTIL-limited rule stops after boundary",
    timezone: "UTC",
    dtstart: "2026-04-01T09:00:00.000Z",
    rrule: "FREQ=DAILY;UNTIL=20260403T090000Z;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
    after: "2026-04-03T09:00:01.000Z",
    expected: null,
  },
  {
    name: "Hourly recurrence returns next same-day occurrence",
    timezone: "UTC",
    dtstart: "2026-04-01T00:00:00.000Z",
    rrule: "FREQ=HOURLY;INTERVAL=6;BYMINUTE=0;BYSECOND=0",
    after: "2026-04-01T07:00:00.000Z",
    expected: "2026-04-01T12:00:00.000Z",
  },
];

test("computeNextOccurrence handles critical timezone and calendar edges", () => {
  for (const testCase of cases) {
    const actual = computeNextOccurrence(
      testCase.rrule,
      testCase.dtstart,
      testCase.timezone,
      new Date(testCase.after),
    );

    assert.equal(actual, testCase.expected, testCase.name);
  }
});
