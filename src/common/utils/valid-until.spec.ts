import { bishkekDate, bishkekTime } from "./bishkek-format";
import { certificateValidUntil } from "./valid-until";

describe("certificateValidUntil", () => {
  it.each([
    // paidAt (UTC)                  months  ends (UTC) = 23:59:59.999 Bishkek
    ["2026-11-10T08:23:00.000Z", 12, "2027-11-10T17:59:59.999Z"], // 14:23 Bishkek
    ["2026-10-31T19:30:00.000Z", 1, "2026-12-01T17:59:59.999Z"], // 01:30 on 01.11 in Bishkek
    ["2026-01-31T10:00:00.000Z", 1, "2026-02-28T17:59:59.999Z"],
    ["2028-01-31T10:00:00.000Z", 1, "2028-02-29T17:59:59.999Z"], // leap year
    ["2026-03-31T10:00:00.000Z", 3, "2026-06-30T17:59:59.999Z"],
    ["2026-11-15T10:00:00.000Z", 3, "2027-02-15T17:59:59.999Z"], // over the year
    ["2026-11-10T17:59:59.999Z", 6, "2027-05-10T17:59:59.999Z"], // the last ms of a Bishkek day
    ["2026-11-10T18:00:00.000Z", 6, "2027-05-11T17:59:59.999Z"], // the first ms of the next one
  ])("%s + %i months → %s", (paidAt, months, expected) => {
    expect(certificateValidUntil(new Date(paidAt), months).toISOString()).toBe(expected);
  });

  it("is shown as the right date, valid to 23:59 that day", () => {
    const until = certificateValidUntil(new Date("2026-10-31T19:30:00.000Z"), 12);

    expect(bishkekDate(until)).toBe("01.11.2027");
    expect(bishkekTime(until)).toBe("23:59");
  });
});
