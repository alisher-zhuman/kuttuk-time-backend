import * as fc from "fast-check";

import { addMonths } from "./add-months";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("addMonths", () => {
  it.each([
    ["2027-01-31T10:00:00", 1, "2027-02-28T10:00:00"],
    ["2028-01-31T10:00:00", 1, "2028-02-29T10:00:00"],
    ["2027-01-30T00:00:00", 1, "2027-02-28T00:00:00"],
    ["2027-03-31T23:59:59", 1, "2027-04-30T23:59:59"],
    ["2027-08-31T12:00:00", 6, "2028-02-29T12:00:00"],
    ["2027-12-31T08:00:00", 2, "2028-02-29T08:00:00"],
    ["2026-11-15T08:00:00", 3, "2027-02-15T08:00:00"],
    ["2028-02-29T09:30:00", 12, "2029-02-28T09:30:00"],
    ["2028-02-29T09:30:00", 24, "2030-02-28T09:30:00"],
    ["2028-02-29T09:30:00", 48, "2032-02-29T09:30:00"],
    ["2026-10-12T05:00:00", 12, "2027-10-12T05:00:00"],
    ["2026-05-31T00:00:00", 0, "2026-05-31T00:00:00"],
  ])("%s + %i months = %s", (from, months, expected) => {
    expect(addMonths(utc(from), months).toISOString()).toBe(utc(expected).toISOString());
  });

  it("does not mutate its argument", () => {
    const date = utc("2027-01-31T10:00:00");

    addMonths(date, 1);

    expect(date.toISOString()).toBe("2027-01-31T10:00:00.000Z");
  });

  it("property: lands exactly n months later, on the same day or the target month's last day", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01Z"),
          max: new Date("2100-01-01Z"),
          noInvalidDate: true,
        }),
        fc.integer({ min: 0, max: 60 }),
        (date, n) => {
          const result = addMonths(date, n);
          const monthsApart =
            (result.getUTCFullYear() - date.getUTCFullYear()) * 12 +
            (result.getUTCMonth() - date.getUTCMonth());
          const lastDay = new Date(
            Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
          ).getUTCDate();

          expect(monthsApart).toBe(n);
          expect(result.getUTCDate()).toBe(Math.min(date.getUTCDate(), lastDay));
          expect(result.getTime() % 86_400_000).toBe(date.getTime() % 86_400_000);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
