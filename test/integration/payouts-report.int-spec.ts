import type { DataSource } from "typeorm";

import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { Merchant } from "../../src/merchants/entities/merchant.entity";
import type { User } from "../../src/users/entities/user.entity";
import { buildPayoutReport, readOnly, weekOf } from "../../src/payouts/payouts-report";
import { openTestDataSource, truncateAll } from "../helpers/db";
import { createMerchant, createOrder, createUser } from "../helpers/factories";

// Week of Mon 2026-10-19 … Sun 2026-10-25 in Bishkek (UTC+6, no DST).
const WEEK = { from: "2026-10-19", to: "2026-10-25" };
const bishkek = (local: string) => new Date(`${local}+06:00`);

describe("payouts report (integration)", () => {
  let ds: DataSource;
  let buyer: User;

  const sale = (merchant: Merchant, amount: number, paidAt: Date, status = OrderStatus.Paid) =>
    createOrder(ds, {
      userId: buyer.id,
      merchantId: merchant.id,
      amount,
      status,
      paidAt: status === OrderStatus.Paid || status === OrderStatus.NeedsReview ? paidAt : null,
    });

  beforeAll(async () => {
    ds = await openTestDataSource();
  });

  beforeEach(async () => {
    await truncateAll(ds);
    buyer = await createUser(ds);
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  describe("weekOf (computed in SQL)", () => {
    it.each(["2026-10-19", "2026-10-21", "2026-10-25"])(
      "%s → the whole Mon–Sun week",
      async (date) => {
        await expect(weekOf(ds, date)).resolves.toEqual(WEEK);
      },
    );

    it("the next Monday starts the next week", async () => {
      await expect(weekOf(ds, "2026-10-26")).resolves.toEqual({
        from: "2026-10-26",
        to: "2026-11-01",
      });
    });

    it("a week across a year boundary", async () => {
      await expect(weekOf(ds, "2027-01-01")).resolves.toEqual({
        from: "2026-12-28",
        to: "2027-01-03",
      });
    });

    it.each(["2026-02-30", "26-10-19", "yesterday"])("rejects %p", async (date) => {
      await expect(weekOf(ds, date)).rejects.toThrow(/YYYY-MM-DD/);
    });
  });

  describe("week boundaries in Bishkek time", () => {
    it("Sun 23:59 Bishkek is this week, Mon 00:00 Bishkek is the next one", async () => {
      const merchant = await createMerchant(ds);

      await sale(merchant, 1000, bishkek("2026-10-25T23:59:00"));
      await sale(merchant, 500, bishkek("2026-10-26T00:00:00"));

      const thisWeek = await buildPayoutReport(ds, WEEK);
      const nextWeek = await buildPayoutReport(ds, await weekOf(ds, "2026-10-26"));

      expect(thisWeek.rows).toEqual([expect.objectContaining({ ordersCount: 1, gross: 1000 })]);
      expect(nextWeek.rows).toEqual([expect.objectContaining({ ordersCount: 1, gross: 500 })]);
    });

    it("Mon 00:00 Bishkek is in, Sun 23:59:59 Bishkek before it is out", async () => {
      const merchant = await createMerchant(ds);

      await sale(merchant, 1000, bishkek("2026-10-19T00:00:00"));
      await sale(merchant, 500, bishkek("2026-10-18T23:59:59"));

      const report = await buildPayoutReport(ds, WEEK);

      expect(report.rows).toEqual([expect.objectContaining({ ordersCount: 1, gross: 1000 })]);
    });

    it("uses Bishkek, not UTC: 2026-10-25T20:00Z is already Monday in Bishkek", async () => {
      const merchant = await createMerchant(ds);

      // 20:00 UTC on Sunday = 02:00 Monday in Bishkek → next week, though it's Sunday in UTC.
      await sale(merchant, 1000, new Date("2026-10-25T20:00:00Z"));

      expect((await buildPayoutReport(ds, WEEK)).rows).toEqual([]);
    });
  });

  describe("what counts", () => {
    it("only paid orders: needs_review, pending and expired are not paid out", async () => {
      const merchant = await createMerchant(ds);
      const inWeek = bishkek("2026-10-21T12:00:00");

      await sale(merchant, 1000, inWeek);
      await sale(merchant, 2000, inWeek, OrderStatus.NeedsReview);
      await sale(merchant, 3000, inWeek, OrderStatus.Pending);
      await sale(merchant, 5000, inWeek, OrderStatus.Expired);

      const report = await buildPayoutReport(ds, WEEK);

      expect(report.rows).toEqual([
        expect.objectContaining({ merchantId: merchant.id, ordersCount: 1, gross: 1000 }),
      ]);
    });

    it("lists needs_review orders of the period separately", async () => {
      const merchant = await createMerchant(ds);
      const review = await sale(
        merchant,
        2000,
        bishkek("2026-10-22T09:00:00"),
        OrderStatus.NeedsReview,
      );

      await sale(merchant, 2000, bishkek("2026-10-27T09:00:00"), OrderStatus.NeedsReview);

      const report = await buildPayoutReport(ds, WEEK);

      expect(report.needsReview).toEqual([
        expect.objectContaining({ orderId: review.id, merchantId: merchant.id, amount: 2000 }),
      ]);
      expect(report.rows).toEqual([]);
    });

    it("a merchant without paid sales in the period isn't in the report", async () => {
      const seller = await createMerchant(ds);
      const quiet = await createMerchant(ds);
      const onlyReview = await createMerchant(ds);

      await sale(seller, 1000, bishkek("2026-10-20T10:00:00"));
      await sale(quiet, 1000, bishkek("2026-10-10T10:00:00"));
      await sale(onlyReview, 1000, bishkek("2026-10-20T10:00:00"), OrderStatus.NeedsReview);

      const report = await buildPayoutReport(ds, WEEK);

      expect(report.rows.map((r) => r.merchantId)).toEqual([seller.id]);
    });
  });

  describe("money", () => {
    it("90% to the merchant, 10% platform commission, per merchant, with totals", async () => {
      const a = await createMerchant(ds, { name: "Sierra, Coffee" });
      const b = await createMerchant(ds);
      const day = bishkek("2026-10-23T15:00:00");

      await sale(a, 1000, day);
      await sale(a, 500, day);
      await sale(b, 10, day);

      const report = await buildPayoutReport(ds, WEEK);

      expect(report.rows).toEqual([
        {
          merchantId: a.id,
          merchantName: "Sierra, Coffee",
          ordersCount: 2,
          gross: 1500,
          commission: 150,
          payout: 1350,
        },
        {
          merchantId: b.id,
          merchantName: b.name,
          ordersCount: 1,
          gross: 10,
          commission: 1,
          payout: 9,
        },
      ]);
      expect(report.total).toEqual({ ordersCount: 3, gross: 1510, commission: 151, payout: 1359 });
    });

    it("fractions: the payout is floored on the merchant total, payout + commission = gross", async () => {
      const merchant = await createMerchant(ds);
      const day = bishkek("2026-10-23T15:00:00");

      // 15 + 15 = 30 → 27 exactly; per-order flooring would give 13 + 13 = 26.
      await sale(merchant, 15, day);
      await sale(merchant, 15, day);

      const [row] = (await buildPayoutReport(ds, WEEK)).rows;

      expect(row).toMatchObject({ gross: 30, payout: 27, commission: 3 });

      await sale(merchant, 15, day);

      // 45 × 0.9 = 40.5 → 40 for the merchant, 5 commission.
      expect((await buildPayoutReport(ds, WEEK)).rows[0]).toMatchObject({
        gross: 45,
        payout: 40,
        commission: 5,
      });
    });
  });

  it("is read-only: the report runs in a READ ONLY transaction and changes nothing", async () => {
    const merchant = await createMerchant(ds);

    await sale(merchant, 1000, bishkek("2026-10-21T12:00:00"));

    const before = await ds.query(`SELECT id, status, "updatedAt" FROM orders ORDER BY id`);

    await buildPayoutReport(ds, WEEK);

    expect(await ds.query(`SELECT id, status, "updatedAt" FROM orders ORDER BY id`)).toEqual(
      before,
    );
  });

  it("readOnly() makes Postgres reject writes (25006 read_only_sql_transaction)", async () => {
    await expect(
      readOnly(ds, (em) => em.query(`UPDATE orders SET status = 'expired'`)),
    ).rejects.toMatchObject({ driverError: expect.objectContaining({ code: "25006" }) });
  });

  it("rejects from > to", async () => {
    await expect(buildPayoutReport(ds, { from: "2026-10-25", to: "2026-10-19" })).rejects.toThrow(
      /must not be after/,
    );
  });
});
