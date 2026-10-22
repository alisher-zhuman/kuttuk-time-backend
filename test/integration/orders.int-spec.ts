import request from "supertest";

import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import { OrdersService } from "../../src/orders/orders.service";
import { FinikNetworkError } from "../../src/finik/finik.errors";
import { createTestApp, type TestApp } from "../helpers/app";
import {
  createCertificate,
  createMerchant,
  createOrder,
  createUser,
  createVenue,
} from "../helpers/factories";

const MINUTE = 60 * 1000;

describe("Orders API (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const orders = () => t.ds.getRepository(Order);

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("POST /api/orders", () => {
    it("401 without a JWT", async () => {
      await http().post("/api/orders").send({ venueId: 1, nominal: 1000 }).expect(401);
    });

    it("400 on a nominal the venue doesn't offer (another venue's nominal)", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds, { nominals: [500, 1000] });

      await createVenue(t.ds, { nominals: [3000] });

      const res = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 3000 })
        .expect(400);

      expect(res.body.message).toBe("Nominal is not available for this venue");
      expect(await orders().count()).toBe(0);
      expect(t.finik.calls).toHaveLength(0);
    });

    it.each([
      ["an inactive venue", { isActive: false }, true],
      ["an active venue of an inactive merchant", {}, false],
    ])("400 on %s", async (_name, venueFields, merchantActive) => {
      const user = await createUser(t.ds);
      const owner = await createMerchant(t.ds, { isActive: merchantActive });
      const venue = await createVenue(t.ds, { ...venueFields, merchantId: owner.id });

      const res = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000 })
        .expect(400);

      expect(res.body.message).toBe("Venue is not available");
      expect(await orders().count()).toBe(0);
    });

    it("201 → a pending order row with the payment URL, 30 min TTL, Finik called with its id", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const before = Date.now();

      const res = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000 })
        .expect(201);

      const row = await orders().findOneByOrFail({ id: res.body.orderId });

      expect(row).toMatchObject({
        userId: user.id,
        venueId: venue.id,
        merchantId: venue.merchantId, // the owner at the moment of the sale
        amount: 1000,
        status: OrderStatus.Pending,
        paymentUrl: `https://pay.test/${row.id}`,
        paidAt: null,
      });
      expect(row.expiresAt.getTime() - before).toBeGreaterThanOrEqual(30 * MINUTE - 1000);
      expect(row.expiresAt.getTime() - before).toBeLessThanOrEqual(30 * MINUTE + 5000);
      expect(res.body).toEqual({
        orderId: row.id,
        paymentUrl: row.paymentUrl,
        expiresAt: row.expiresAt.toISOString(),
      });
      expect(t.finik.calls).toEqual([
        expect.objectContaining({ paymentId: row.id, amount: 1000, nameEn: venue.name }),
      ]);
    });

    it("sends Finik our return URL, which redirects to the order in the Mini App (startapp=order_<id>)", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);

      const first = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000 })
        .expect(201);
      const second = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 500 })
        .expect(201);

      // Our own return endpoint on FINIK_WEBHOOK_URL's origin (http://localhost in globalSetup),
      // not t.me directly — Finik's intermediate redirect mangled the direct link.
      expect(t.finik.calls.map((call) => call.redirectUrl)).toEqual([
        `http://localhost/api/payments/return/${first.body.orderId}`,
        `http://localhost/api/payments/return/${second.body.orderId}`,
      ]);

      // Following it lands on the Mini App, straight on the order (FINIK_REDIRECT_URL is t.me).
      for (const [i, { body }] of [first, second].entries()) {
        const path = new URL(t.finik.calls[i].redirectUrl).pathname;
        const res = await http().get(path).expect(302);

        expect(res.headers.location).toBe(
          `https://t.me/kuttuk_time_bot/app?startapp=order_${body.orderId}`,
        );
      }
    });

    it("strips extra fields: client amount/status are ignored", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);

      const res = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000, amount: 1, status: "paid", userId: 999 })
        .expect(201);

      const row = await orders().findOneByOrFail({ id: res.body.orderId });

      expect(row).toMatchObject({ amount: 1000, status: OrderStatus.Pending, userId: user.id });
      expect(t.finik.calls[0].amount).toBe(1000);
    });

    it("502 when Finik fails; the order is kept as expired", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);

      t.finik.failWith = new FinikNetworkError("Finik request failed: fetch failed");

      const res = await http()
        .post("/api/orders")
        .auth(t.tokenFor(user), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000 })
        .expect(502);

      expect(res.body.message).not.toContain("fetch failed");

      const rows = await orders().find();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: OrderStatus.Expired, paymentUrl: null });
    });
  });

  describe("GET /api/orders/:id", () => {
    it("200 for the owner", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const order = await createOrder(t.ds, {
        userId: user.id,
        venueId: venue.id,
        paymentUrl: "https://pay.test/x",
      });

      const res = await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(200);

      expect(res.body).toMatchObject({
        orderId: order.id,
        status: "pending",
        amount: 1000,
        venueId: venue.id,
        paymentUrl: "https://pay.test/x",
        certificate: null,
      });
    });

    it("200 with the certificate code once paid", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const order = await createOrder(t.ds, {
        userId: user.id,
        venueId: venue.id,
        status: OrderStatus.Paid,
        paidAt: new Date(),
      });

      const cert = await createCertificate(t.ds, {
        orderId: order.id,
        venueId: venue.id,
        ownerUserId: user.id,
        code: "12345678",
      });

      const res = await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(200);

      expect(res.body).toMatchObject({
        status: "paid",
        paymentUrl: null,
        // id — for "Подарить" (POST /certificates/:id/share) from the order screen.
        certificate: { id: cert.id, code: "12345678", validUntil: cert.validUntil.toISOString() },
      });
    });

    it("200 with status refunded as is (no certificate, no payment URL)", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const order = await createOrder(t.ds, {
        userId: user.id,
        venueId: venue.id,
        status: OrderStatus.Refunded,
        paidAt: new Date(),
        paymentUrl: "https://pay.test/x",
      });

      const res = await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(200);

      expect(res.body).toMatchObject({ status: "refunded", paymentUrl: null, certificate: null });
    });

    it("404 for someone else's order", async () => {
      const owner = await createUser(t.ds);
      const stranger = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const order = await createOrder(t.ds, { userId: owner.id, venueId: venue.id });

      await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(stranger), { type: "bearer" })
        .expect(404);
    });

    it("400 for a non-UUID id", async () => {
      const user = await createUser(t.ds);

      await http()
        .get("/api/orders/not-a-uuid")
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(400);
    });
  });

  describe("expiry cron (called directly; the scheduler is off in tests)", () => {
    it("expires pending orders past expiresAt and leaves the rest alone", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds);
      const base = { userId: user.id, venueId: venue.id };

      const stale = await createOrder(t.ds, { ...base, expiresAt: new Date(Date.now() - MINUTE) });
      const fresh = await createOrder(t.ds, { ...base, expiresAt: new Date(Date.now() + MINUTE) });
      const paid = await createOrder(t.ds, {
        ...base,
        status: OrderStatus.Paid,
        paidAt: new Date(),
        expiresAt: new Date(Date.now() - MINUTE),
      });

      await expect(t.app.get(OrdersService).expireStale()).resolves.toBe(1);

      const status = async (id: string) => (await orders().findOneByOrFail({ id })).status;

      expect(await status(stale.id)).toBe(OrderStatus.Expired);
      expect(await status(fresh.id)).toBe(OrderStatus.Pending);
      expect(await status(paid.id)).toBe(OrderStatus.Paid);
    });
  });
});
