import request from "supertest";

import { OrderStatus } from "../../src/orders/entities/order.entity";
import { buildPayoutReport } from "../../src/payouts/payouts-report";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";

const WEEK = { from: "2026-10-19", to: "2026-10-25" };
const bishkek = (local: string) => new Date(`${local}+06:00`);
const DAY = 24 * 60 * 60 * 1000;

describe("GET /api/admin/payouts (integration)", () => {
  let t: TestApp;
  let admin: User;
  let buyer: User;

  const http = () => request(t.app.getHttpServer());
  const get = (query = "", user = admin) =>
    http().get(`/api/admin/payouts${query}`).auth(t.tokenFor(user), { type: "bearer" });

  const sale = (venue: Venue, amount: number, paidAt: Date, status = OrderStatus.Paid) =>
    createOrder(t.ds, { userId: buyer.id, venueId: venue.id, amount, status, paidAt });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await createUser(t.ds, { role: "admin" });
    buyer = await createUser(t.ds);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("a week: per merchant (all its venues), totals, needs_review counted but not paid out", async () => {
    const chain = await createMerchant(t.ds, { name: "Coffee Chain" });
    const [a, b] = [
      await createVenue(t.ds, { merchantId: chain.id }),
      await createVenue(t.ds, { merchantId: chain.id }),
    ];
    const solo = await createVenue(t.ds);
    const day = bishkek("2026-10-22T12:00:00");

    await sale(a, 1000, day);
    await sale(b, 500, day);
    await sale(solo, 10, day);
    await sale(a, 2000, day, OrderStatus.NeedsReview);
    await sale(a, 3000, bishkek("2026-10-26T00:00:00")); // next week

    const res = await get("?week=2026-10-25").expect(200);

    expect(res.body).toEqual({
      ...WEEK,
      merchants: [
        {
          merchantId: chain.id,
          merchantName: "Coffee Chain",
          ordersCount: 2,
          gross: 1500,
          commission: 150,
          payout: 1350,
          paidOut: 0,
          due: 1350,
          payouts: [],
        },
        {
          merchantId: solo.merchantId,
          merchantName: expect.any(String),
          ordersCount: 1,
          gross: 10,
          commission: 1,
          payout: 9,
          paidOut: 0,
          due: 9,
          payouts: [],
        },
      ],
      total: { ordersCount: 3, gross: 1510, commission: 151, payout: 1359, paidOut: 0, due: 1359 },
      needsReviewCount: 1,
    });
  });

  it("the same numbers as the CSV report and the merchant cabinet", async () => {
    const owner = await createUser(t.ds, { role: "merchant" });
    const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
    const venue = await createVenue(t.ds, { merchantId: merchant.id });
    const day = bishkek("2026-10-20T09:00:00");

    await sale(venue, 15, day);
    await sale(venue, 15, day);
    await sale(venue, 15, day);

    const screen = (await get("?week=2026-10-20").expect(200)).body;
    const csv = await buildPayoutReport(t.ds, WEEK);
    const cabinet = (
      await http()
        .get("/api/merchants/me/summary?week=2026-10-20")
        .auth(t.tokenFor(owner), { type: "bearer" })
        .expect(200)
    ).body;

    expect(screen.merchants).toEqual(
      csv.rows.map((row) => ({ ...row, paidOut: 0, due: row.payout, payouts: [] })),
    );
    expect(screen.total).toMatchObject(csv.total);
    // 45 × 0.9 = 40.5 → 40, floored on the merchant's total.
    expect(cabinet).toMatchObject({ payout: 40, commission: 5, sold: { count: 3, amount: 45 } });
    expect(screen.merchants[0]).toMatchObject({ payout: 40, commission: 5, gross: 45 });
  });

  it("defaults to the current Mon–Sun week in Bishkek", async () => {
    const res = await get().expect(200);
    const today = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from = new Date(`${res.body.from}T00:00:00Z`);

    expect(from.getUTCDay()).toBe(1);
    expect(new Date(from.getTime() + 6 * DAY).toISOString().slice(0, 10)).toBe(res.body.to);
    expect(today >= res.body.from && today <= res.body.to).toBe(true);
  });

  it("an empty week → no merchants, zero totals", async () => {
    expect((await get("?week=2026-01-07").expect(200)).body).toEqual({
      from: "2026-01-05",
      to: "2026-01-11",
      merchants: [],
      total: { ordersCount: 0, gross: 0, commission: 0, payout: 0, paidOut: 0, due: 0 },
      needsReviewCount: 0,
    });
  });

  it.each(["yesterday", "2026-02-30"])("400 on week=%p", async (week) => {
    await get(`?week=${week}`).expect(400);
  });

  it("403 for a merchant and a buyer, 401 without a token", async () => {
    await get("", await createUser(t.ds, { role: "merchant" })).expect(403);
    await get("", buyer).expect(403);
    await http().get("/api/admin/payouts").expect(401);
  });

  it("is read-only: the orders are unchanged", async () => {
    await sale(await createVenue(t.ds), 1000, bishkek("2026-10-21T12:00:00"));

    const before = await t.ds.query(`SELECT id, status, "updatedAt" FROM orders ORDER BY id`);

    await get("?week=2026-10-21").expect(200);

    expect(await t.ds.query(`SELECT id, status, "updatedAt" FROM orders ORDER BY id`)).toEqual(
      before,
    );
  });
});
