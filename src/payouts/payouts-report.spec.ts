import { assertDate, payoutReportCsv, type PayoutReport } from "./payouts-report";

describe("payoutReportCsv", () => {
  const report: PayoutReport = {
    period: { from: "2026-10-19", to: "2026-10-25" },
    rows: [
      {
        merchantId: 1,
        merchantName: 'Sierra, "Coffee"',
        ordersCount: 2,
        gross: 1500,
        commission: 150,
        payout: 1350,
      },
      { merchantId: 2, merchantName: "Navat", ordersCount: 1, gross: 10, commission: 1, payout: 9 },
    ],
    total: { ordersCount: 3, gross: 1510, commission: 151, payout: 1359 },
    needsReview: [],
  };

  it("header, one line per merchant (RFC 4180 quoting), a TOTAL line", () => {
    expect(payoutReportCsv(report)).toBe(
      [
        "merchantId,merchantName,ordersCount,gross,commission,payout",
        '1,"Sierra, ""Coffee""",2,1500,150,1350',
        "2,Navat,1,10,1,9",
        "TOTAL,,3,1510,151,1359",
        "",
      ].join("\n"),
    );
  });

  it("an empty period still has the header and a zero TOTAL", () => {
    expect(
      payoutReportCsv({
        ...report,
        rows: [],
        total: { ordersCount: 0, gross: 0, commission: 0, payout: 0 },
      }),
    ).toBe("merchantId,merchantName,ordersCount,gross,commission,payout\nTOTAL,,0,0,0,0\n");
  });
});

describe("assertDate", () => {
  it.each(["2026-10-19", "2028-02-29"])("accepts %p", (date) => {
    expect(assertDate(date, "from")).toBe(date);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-1-9", "19.10.2026", ""])("rejects %p", (date) => {
    expect(() => assertDate(date, "from")).toThrow(/from must be a date YYYY-MM-DD/);
  });
});
