import request from "supertest";

import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { Merchant } from "../../src/merchants/entities/merchant.entity";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";

const bishkek = (local: string) => new Date(`${local}+06:00`);
const IN_WEEK = bishkek("2026-10-21T12:00:00"); // week 2026-10-19 … 25

describe("marking payouts (integration)", () => {
  let t: TestApp;
  let admin: User;
  let owner: User;
  let merchant: Merchant;
  let venue: Venue;
  let buyer: User;

  const http = () => request(t.app.getHttpServer());
  const as = (user: User, req: request.Test) => req.auth(t.tokenFor(user), { type: "bearer" });
  const mark = (body: Record<string, unknown> = {}, user = admin) =>
    as(user, http().post("/api/admin/payouts")).send({
      merchantId: merchant.id,
      week: "2026-10-21",
      ...body,
    });
  const week = () => as(admin, http().get("/api/admin/payouts?week=2026-10-21")).expect(200);
  const rowOf = async (merchantId = merchant.id) =>
    (await week()).body.merchants.find((m: { merchantId: number }) => m.merchantId === merchantId);

  const sale = (amount: number, paidAt = IN_WEEK, status = OrderStatus.Paid, forVenue = venue) =>
    createOrder(t.ds, { userId: buyer.id, venueId: forVenue.id, amount, status, paidAt });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await createUser(t.ds, { role: "admin" });
    owner = await createUser(t.ds, { role: "merchant", language: "ru" });
    merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
    venue = await createVenue(t.ds, { merchantId: merchant.id });
    buyer = await createUser(t.ds);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("marks the week: amount computed on the server, orders linked, the owner told in the bot", async () => {
    const orders = [await sale(15), await sale(15), await sale(15)];

    // A client-sent amount is ignored (stripped by the whitelist) — the server computes it.
    const res = await mark({ note: " Mbank 27.10 ", payout: 1_000_000 }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      merchantId: merchant.id,
      from: "2026-10-19",
      to: "2026-10-25",
      ordersCount: 3,
      gross: 45,
      commission: 5,
      payout: 40, // 45 × 0.9 = 40.5 → floored on the total, like the report
      note: "Mbank 27.10",
      paidBy: admin.id,
      createdAt: expect.any(String),
    });

    const linked = await t.ds.query(`SELECT "payoutId" FROM orders WHERE id = ANY($1::uuid[])`, [
      orders.map((o) => o.id),
    ]);

    expect(linked.map((o: { payoutId: string }) => o.payoutId)).toEqual(Array(3).fill(res.body.id));
    expect(await rowOf()).toMatchObject({ payout: 40, paidOut: 40, due: 0 });

    await waitFor(() => t.bot.sent.length === 1);
    expect(t.bot.sent[0]).toMatchObject({
      chatId: owner.telegramId,
      html: "💸 Выплата: <b>40 сом</b> за 19.10.2026–25.10.2026\n\nПродаж: 3 на 45 сом, комиссия 5 сом",
      button: { text: "Открыть кабинет" },
    });
  });

  it("expectedPayout: a matching amount records it; a sale paid meanwhile → 409 amount_changed, nothing recorded", async () => {
    await sale(1000);

    // The admin saw 900, then another sale was paid before they confirmed.
    await sale(100);

    const changed = await mark({ expectedPayout: 900 }).expect(409);

    expect(changed.body).toMatchObject({ error: "amount_changed" });
    expect(changed.body.message).toContain("990");
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM payouts`)).toEqual([{ n: 0 }]);
    expect(
      await t.ds.query(`SELECT count(*)::int AS n FROM orders WHERE "payoutId" IS NOT NULL`),
    ).toEqual([{ n: 0 }]);

    expect((await mark({ expectedPayout: 990 }).expect(201)).body).toMatchObject({ payout: 990 });
    await mark({ expectedPayout: -1 }).expect(400);
    await mark({ expectedPayout: 1.5 }).expect(400);
  });

  it("a second mark → 409 nothing_to_pay_out; 5 simultaneous marks → exactly one payout", async () => {
    await sale(1000);

    const results = await Promise.all(Array.from({ length: 5 }, () => mark()));

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect((await mark().expect(409)).body).toMatchObject({ error: "nothing_to_pay_out" });
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM payouts`)).toEqual([{ n: 1 }]);
    expect(await rowOf()).toMatchObject({ paidOut: 900, due: 0 });
  });

  it("two marks racing on the same orders (forced to overlap) → one payout, the other 409", async () => {
    const order = await sale(1000);
    // Hold a lock on the order so both marks pile up behind it, whatever the timing.
    const blocker = t.ds.createQueryRunner();

    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(`SELECT 1 FROM orders WHERE id = $1 FOR UPDATE`, [order.id]);

    const racing = [mark(), mark()].map((req) => req.then((res) => res));

    try {
      // Both requests are inside their transaction, waiting for the lock.
      for (let i = 0; i < 200; i++) {
        const [{ n }] = await t.ds.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND datname = current_database()`,
        );

        if (n >= 2) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      await blocker.commitTransaction();
      await blocker.release();
    }

    const statuses = (await Promise.all(racing)).map((res) => res.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM payouts`)).toEqual([{ n: 1 }]);
    expect(await rowOf()).toMatchObject({ paidOut: 900, due: 0 });
  });

  it("an order landing in the week after the mark shows as due; the next mark covers only it", async () => {
    await sale(1000);
    await mark().expect(201);
    await sale(500); // e.g. a late webhook with a paidAt inside the week

    expect(await rowOf()).toMatchObject({ payout: 1350, paidOut: 900, due: 450 });

    const topUp = await mark({ note: "top-up" }).expect(201);

    expect(topUp.body).toMatchObject({ ordersCount: 1, gross: 500, payout: 450 });

    const row = await rowOf();

    expect(row).toMatchObject({ paidOut: 1350, due: 0 });
    // The week's history for the admin: both payouts, oldest first, the note only where given.
    expect(row.payouts).toEqual([
      {
        id: expect.any(String),
        payout: 900,
        ordersCount: 1,
        paidBy: admin.id,
        createdAt: expect.any(String),
      },
      {
        id: topUp.body.id,
        payout: 450,
        ordersCount: 1,
        note: "top-up",
        paidBy: admin.id,
        createdAt: expect.any(String),
      },
    ]);
  });

  it("covers only this merchant's paid orders of this week", async () => {
    const other = await createVenue(t.ds);
    const mine = await sale(1000);
    const review = await sale(2000, IN_WEEK, OrderStatus.NeedsReview);
    const nextWeek = await sale(3000, bishkek("2026-10-26T00:00:00"));
    const theirs = await sale(4000, IN_WEEK, OrderStatus.Paid, other);

    await mark().expect(201);

    const payoutIds = Object.fromEntries(
      (await t.ds.query(`SELECT id, "payoutId" FROM orders`)).map(
        (o: { id: string; payoutId: string | null }) => [o.id, o.payoutId],
      ),
    );

    expect(payoutIds[mine.id]).not.toBeNull();
    expect([payoutIds[review.id], payoutIds[nextWeek.id], payoutIds[theirs.id]]).toEqual([
      null,
      null,
      null,
    ]);
    expect(await rowOf(other.merchantId)).toMatchObject({ paidOut: 0, due: 3600 });
  });

  it("the cabinet summary shows paidOut / due for the whole merchant, not with ?venueId=", async () => {
    await sale(1000);
    await mark().expect(201);
    await sale(500);

    const summary = (venueQuery = "") =>
      as(owner, http().get(`/api/merchants/me/summary?week=2026-10-21${venueQuery}`)).expect(200);

    expect((await summary()).body).toMatchObject({ payout: 1350, paidOut: 900, due: 450 });

    const narrowed = (await summary(`&venueId=${venue.id}`)).body;

    expect(narrowed).not.toHaveProperty("paidOut");
    expect(narrowed).not.toHaveProperty("due");
  });

  it("the admin orders list shows which orders are paid out", async () => {
    const paidOut = await sale(1000);

    const { body: payout } = await mark().expect(201);
    const unpaid = await sale(500);
    const items = (await as(admin, http().get("/api/admin/orders")).expect(200)).body.items;

    expect(items.find((o: { id: string }) => o.id === paidOut.id).payoutId).toBe(payout.id);
    expect(items.find((o: { id: string }) => o.id === unpaid.id)).not.toHaveProperty("payoutId");
  });

  it("400 on a bad week / unknown merchant, 403 for a merchant", async () => {
    await sale(1000);

    await mark({ week: "2026-02-30" }).expect(400);
    await mark({ week: "yesterday" }).expect(400);
    await mark({ merchantId: 999_999 }).expect(400);
    await mark({}, owner).expect(403);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM payouts`)).toEqual([{ n: 0 }]);
  });

  it("the DB refuses a payoutId on an order that isn't paid", async () => {
    await sale(1000);

    const { body: payout } = await mark().expect(201);
    const review = await sale(2000, IN_WEEK, OrderStatus.NeedsReview);

    await expect(
      t.ds.query(`UPDATE orders SET "payoutId" = $1 WHERE id = $2`, [payout.id, review.id]),
    ).rejects.toMatchObject({ constraint: "orders_payout_only_paid" });
  });
});
