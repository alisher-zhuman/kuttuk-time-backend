import * as request from "supertest";

import { generateCertificateCode } from "../../src/certificates/certificate-code";
import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import type { Merchant } from "../../src/merchants/entities/merchant.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import { buildPayoutReport } from "../../src/payouts/payouts-report";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import {
  createCertificate,
  createMerchant,
  createOrder,
  createUser,
  createVenue,
} from "../helpers/factories";

const WEEK = { from: "2026-10-19", to: "2026-10-25" };
const bishkek = (local: string) => new Date(`${local}+06:00`);
const DAY = 24 * 60 * 60 * 1000;

describe("merchant cabinet (integration)", () => {
  let t: TestApp;
  let owner: User;
  let merchant: Merchant;
  let venue: Venue;
  let buyer: User;

  const http = () => request(t.app.getHttpServer());
  const get = (path: string, user = owner) =>
    http().get(path).auth(t.tokenFor(user), { type: "bearer" });

  const sale = async (
    amount: number,
    paidAt: Date,
    opts: { status?: OrderStatus; cert?: Partial<Certificate>; forVenue?: Venue } = {},
  ) => {
    const forVenue = opts.forVenue ?? venue;
    const status = opts.status ?? OrderStatus.Paid;
    const order = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: forVenue.id,
      amount,
      status,
      paidAt: status === OrderStatus.Pending ? null : paidAt,
    });

    if (status !== OrderStatus.Paid) {
      return null;
    }

    const cert = await createCertificate(t.ds, {
      orderId: order.id,
      venueId: forVenue.id,
      ownerUserId: buyer.id,
      amount,
      code: generateCertificateCode(),
      ...opts.cert,
    });

    await t.ds.query(`UPDATE certificates SET "createdAt" = $1 WHERE id = $2`, [paidAt, cert.id]);

    return cert;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    owner = await createUser(t.ds, { role: "merchant" });
    merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
    venue = await createVenue(t.ds, { merchantId: merchant.id });
    buyer = await createUser(t.ds);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("GET /api/merchants/me/summary", () => {
    it("defaults to the current Mon–Sun week in Bishkek", async () => {
      const res = await get("/api/merchants/me/summary").expect(200);
      const today = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const from = new Date(`${res.body.from}T00:00:00Z`);

      expect(from.getUTCDay()).toBe(1); // Monday
      expect(new Date(from.getTime() + 6 * DAY).toISOString().slice(0, 10)).toBe(res.body.to);
      expect(today >= res.body.from && today <= res.body.to).toBe(true);
    });

    it("sold / commission / payout / redeemed for the week", async () => {
      const day = bishkek("2026-10-21T12:00:00");

      await sale(1000, day);
      await sale(500, day, {
        cert: { status: CertificateStatus.Used, usedAt: bishkek("2026-10-22T10:00:00") },
      });
      // Sold last week, redeemed this week → counts as redeemed, not as sold.
      await sale(2000, bishkek("2026-10-15T12:00:00"), {
        cert: { status: CertificateStatus.Used, usedAt: bishkek("2026-10-20T09:00:00") },
      });
      // Not paid out: needs_review / refunded / pending.
      await sale(3000, day, { status: OrderStatus.NeedsReview });
      await sale(3000, day, { status: OrderStatus.Refunded });
      await sale(3000, day, { status: OrderStatus.Pending });

      const res = await get("/api/merchants/me/summary?week=2026-10-23").expect(200);

      expect(res.body).toEqual({
        ...WEEK,
        sold: { count: 2, amount: 1500 },
        commission: 150,
        payout: 1350,
        redeemed: { count: 2, amount: 2500 },
      });
    });

    it("matches the payout report for the same week (one source of truth)", async () => {
      const day = bishkek("2026-10-24T18:00:00");

      await sale(1000, day);
      await sale(10, day);
      await sale(500, bishkek("2026-10-19T00:00:00"));

      const res = await get("/api/merchants/me/summary?week=2026-10-19").expect(200);
      const [row] = (await buildPayoutReport(t.ds, WEEK)).rows;

      expect(res.body).toMatchObject({
        sold: { count: row.ordersCount, amount: row.gross },
        commission: row.commission,
        payout: row.payout,
      });
    });

    it("only this merchant's numbers", async () => {
      const other = await createVenue(t.ds); // another merchant's venue

      await sale(5000, bishkek("2026-10-21T12:00:00"), { forVenue: other });

      const res = await get("/api/merchants/me/summary?week=2026-10-21").expect(200);

      expect(res.body).toMatchObject({ sold: { count: 0, amount: 0 }, payout: 0 });
    });

    it("a chain: summed over all its venues; ?venueId= narrows to one", async () => {
      const second = await createVenue(t.ds, { merchantId: merchant.id });
      const day = bishkek("2026-10-21T12:00:00");

      await sale(1000, day, { cert: { status: CertificateStatus.Used, usedAt: day } });
      await sale(500, day, { forVenue: second });

      const whole = await get("/api/merchants/me/summary?week=2026-10-21").expect(200);
      const one = await get(
        `/api/merchants/me/summary?week=2026-10-21&venueId=${second.id}`,
      ).expect(200);

      expect(whole.body).toMatchObject({
        sold: { count: 2, amount: 1500 },
        payout: 1350,
        redeemed: { count: 1, amount: 1000 },
      });
      expect(one.body).toMatchObject({
        sold: { count: 1, amount: 500 },
        commission: 50,
        payout: 450,
        redeemed: { count: 0, amount: 0 },
      });
    });

    it("404 on a venueId that isn't one of the merchant's venues", async () => {
      const other = await createVenue(t.ds);

      await get(`/api/merchants/me/summary?venueId=${other.id}`).expect(404);
      await get("/api/merchants/me/summary?venueId=999999").expect(404);
    });

    it("an empty week is all zeros", async () => {
      expect((await get("/api/merchants/me/summary?week=2026-01-05").expect(200)).body).toEqual({
        from: "2026-01-05",
        to: "2026-01-11",
        sold: { count: 0, amount: 0 },
        commission: 0,
        payout: 0,
        redeemed: { count: 0, amount: 0 },
      });
    });

    it.each(["yesterday", "2026-02-30"])("400 on week=%p", async (week) => {
      await get(`/api/merchants/me/summary?week=${week}`).expect(400);
    });

    it("403 for a buyer, 401 without a token", async () => {
      await get("/api/merchants/me/summary", buyer).expect(403);
      await http().get("/api/merchants/me/summary").expect(401);
    });
  });

  describe("GET /api/merchants/me/certificates", () => {
    it("own certificates, newest first, effective status, usedAt only on used", async () => {
      const other = await createVenue(t.ds); // another merchant's venue

      const old = await sale(1000, new Date(Date.now() - 3 * DAY), {
        cert: { validUntil: new Date(Date.now() - DAY) },
      });
      const used = await sale(500, new Date(Date.now() - 2 * DAY), {
        cert: { status: CertificateStatus.Used, usedAt: new Date(Date.now() - DAY) },
      });
      const fresh = await sale(2000, new Date(Date.now() - DAY));

      await sale(9000, new Date(), { forVenue: other });

      const res = await get("/api/merchants/me/certificates").expect(200);

      expect(res.body.nextCursor).toBeNull();
      expect(res.body.items.map((c: { code: string }) => c.code)).toEqual([
        fresh!.code,
        used!.code,
        old!.code,
      ]);
      expect(res.body.items.map((c: { status: string }) => c.status)).toEqual([
        "active",
        "used",
        "expired",
      ]);
      expect(res.body.items[0]).not.toHaveProperty("usedAt");
      expect(res.body.items[1].usedAt).toEqual(expect.any(String));
      expect(res.body.items[2]).not.toHaveProperty("usedAt");
      expect(res.body.items[0].venue).toEqual({ id: venue.id, name: venue.name });
    });

    it("all of the merchant's venues; ?venueId= narrows to one; a foreign venueId → 404", async () => {
      const second = await createVenue(t.ds, { merchantId: merchant.id });
      const first = await sale(1000, new Date(Date.now() - 2 * DAY));
      const fromSecond = await sale(1000, new Date(Date.now() - DAY), { forVenue: second });

      const all = await get("/api/merchants/me/certificates").expect(200);
      const one = await get(`/api/merchants/me/certificates?venueId=${venue.id}`).expect(200);

      expect(all.body.items.map((c: { code: string }) => c.code)).toEqual([
        fromSecond!.code,
        first!.code,
      ]);
      expect(all.body.items[0].venue).toEqual({ id: second.id, name: second.name });
      expect(one.body.items.map((c: { code: string }) => c.code)).toEqual([first!.code]);

      await get(`/api/merchants/me/certificates?venueId=${(await createVenue(t.ds)).id}`).expect(
        404,
      );
    });

    it.each([
      ["active", ["fresh"]],
      ["used", ["used"]],
      ["expired", ["lapsed", "storedExpired"]],
    ])("?status=%s filters by the effective status", async (status, expected) => {
      const made = {
        fresh: await sale(1000, new Date(Date.now() - 1 * DAY)),
        used: await sale(1000, new Date(Date.now() - 2 * DAY), {
          cert: { status: CertificateStatus.Used, usedAt: new Date() },
        }),
        lapsed: await sale(1000, new Date(Date.now() - 3 * DAY), {
          cert: { validUntil: new Date(Date.now() - 1000) },
        }),
        storedExpired: await sale(1000, new Date(Date.now() - 4 * DAY), {
          cert: { status: CertificateStatus.Expired },
        }),
      };

      const res = await get(`/api/merchants/me/certificates?status=${status}`).expect(200);

      expect(res.body.items.map((c: { code: string }) => c.code)).toEqual(
        expected.map((key) => made[key as keyof typeof made]!.code),
      );
    });

    it("keyset pagination: every item once, in order; a sale between pages doesn't shift them", async () => {
      const codes: string[] = [];

      for (let i = 5; i >= 1; i--) {
        codes.push((await sale(1000, new Date(Date.now() - i * DAY)))!.code);
      }

      const newestFirst = [...codes].reverse();
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const query: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
        const res = await get(`/api/merchants/me/certificates${query}`).expect(200);

        seen.push(...res.body.items.map((c: { code: string }) => c.code));
        cursor = res.body.nextCursor;
        pages++;

        if (pages === 1) {
          // A new sale lands on top — it must not appear in, or shift, the remaining pages.
          await sale(1000, new Date());
        }
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual(newestFirst);
    });

    it.each([
      ["status", "?status=pending"],
      ["limit 0", "?limit=0"],
      ["limit 101", "?limit=101"],
      ["limit not a number", "?limit=ten"],
      ["cursor garbage", "?cursor=not-a-cursor"],
    ])("400 on bad %s", async (_name, query) => {
      await get(`/api/merchants/me/certificates${query}`).expect(400);
    });

    it("403 for a buyer", async () => {
      await get("/api/merchants/me/certificates", buyer).expect(403);
    });
  });
});
