import * as request from "supertest";

import { CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import { OrderResolutionAction } from "../../src/orders/entities/order-resolution.entity";
import { OrderStatus, type Order } from "../../src/orders/entities/order.entity";
import { resolveNeedsReview } from "../../src/orders/resolve-needs-review";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import {
  createCertificate,
  createMerchant,
  createOrder,
  createUser,
  createVenue,
} from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe("admin orders (integration)", () => {
  let t: TestApp;
  let admin: User;
  let buyer: User;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());
  const get = (path: string, user = admin) =>
    http().get(path).auth(t.tokenFor(user), { type: "bearer" });

  // An order created `days` ago; paid ones get a certificate.
  const order = async (days: number, status = OrderStatus.Pending, forVenue = venue) => {
    const created = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: forVenue.id,
      status,
      paidAt: status === OrderStatus.Pending || status === OrderStatus.Expired ? null : ago(days),
    });

    await t.ds.query(`UPDATE orders SET "createdAt" = $1 WHERE id = $2`, [ago(days), created.id]);

    if (status === OrderStatus.Paid) {
      await createCertificate(t.ds, {
        orderId: created.id,
        venueId: forVenue.id,
        ownerUserId: buyer.id,
        code: `1111${String(days).repeat(4)}`,
      });
    }

    return created;
  };

  const ids = (res: request.Response) => res.body.items.map((o: { id: string }) => o.id);

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await createUser(t.ds, { role: "admin" });
    buyer = await createUser(t.ds);
    venue = await createVenue(t.ds, { name: "Coffeeroom" });
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("GET /api/admin/orders", () => {
    it("newest first; paidAt / certificateCode only when set", async () => {
      const pending = await order(0);
      const paid = await order(1, OrderStatus.Paid);
      const review = await order(2, OrderStatus.NeedsReview);

      const res = await get("/api/admin/orders").expect(200);

      expect(ids(res)).toEqual([pending.id, paid.id, review.id]);
      expect(res.body.nextCursor).toBeNull();
      expect(res.body.items[0]).toEqual({
        id: pending.id,
        amount: 1000,
        status: "pending",
        createdAt: expect.any(String),
        venue: { id: venue.id, name: "Coffeeroom" },
        merchant: { id: venue.merchantId, name: expect.any(String) },
      });
      expect(res.body.items[1]).toMatchObject({
        status: "paid",
        paidAt: expect.any(String),
        certificateCode: "11111111",
      });
      expect(res.body.items[2]).toMatchObject({
        status: "needs_review",
        paidAt: expect.any(String),
      });
      expect(res.body.items[2]).not.toHaveProperty("certificateCode");
    });

    it("filters: status, venueId, merchantId (the sale-time owner)", async () => {
      const otherVenue = await createVenue(t.ds);
      const mine = await order(1, OrderStatus.Paid);
      const review = await order(2, OrderStatus.NeedsReview);
      const theirs = await order(3, OrderStatus.Paid, otherVenue);

      expect(ids(await get("/api/admin/orders?status=paid").expect(200))).toEqual([
        mine.id,
        theirs.id,
      ]);
      expect(ids(await get(`/api/admin/orders?venueId=${otherVenue.id}`).expect(200))).toEqual([
        theirs.id,
      ]);

      // Move the venue: its past orders stay with the merchant they were sold by.
      const newOwner = await createMerchant(t.ds);

      await t.ds.query(`UPDATE venues SET "merchantId" = $1 WHERE id = $2`, [
        newOwner.id,
        venue.id,
      ]);

      expect(
        ids(await get(`/api/admin/orders?merchantId=${venue.merchantId}`).expect(200)),
      ).toEqual([mine.id, review.id]);
      expect(ids(await get(`/api/admin/orders?merchantId=${newOwner.id}`).expect(200))).toEqual([]);
    });

    it("search: a certificate code (normalized) or an order id", async () => {
      const paid = await order(1, OrderStatus.Paid);
      const pending = await order(0);

      expect(ids(await get("/api/admin/orders?search=1111%201111").expect(200))).toEqual([paid.id]);
      expect(
        ids(await get(`/api/admin/orders?search=${pending.id.toUpperCase()}`).expect(200)),
      ).toEqual([pending.id]);
      expect(ids(await get("/api/admin/orders?search=99999999").expect(200))).toEqual([]);
    });

    it("keyset pagination: every order once, a new one between pages doesn't shift them", async () => {
      const made: Order[] = [];

      for (let days = 5; days >= 1; days--) {
        made.push(await order(days));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const query: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
        const res = await get(`/api/admin/orders${query}`).expect(200);

        seen.push(...ids(res));
        cursor = res.body.nextCursor;
        pages++;

        if (pages === 1) {
          await order(0);
        }
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual(made.map((o) => o.id).reverse());
    });

    it.each([
      ["status", "?status=lost"],
      ["limit", "?limit=0"],
      ["cursor", "?cursor=garbage"],
      ["search", "?search=hello"],
      ["venueId", "?venueId=abc"],
    ])("400 on bad %s", async (_name, query) => {
      await get(`/api/admin/orders${query}`).expect(400);
    });

    it("403 for a merchant and a buyer, 401 without a token", async () => {
      await get("/api/admin/orders", await createUser(t.ds, { role: "merchant" })).expect(403);
      await get("/api/admin/orders", buyer).expect(403);
      await http().get("/api/admin/orders").expect(401);
    });
  });

  describe("GET /api/admin/orders/:id", () => {
    it("a paid order: certificate (effective status), buyer, the Finik webhook", async () => {
      const created = await createOrder(t.ds, {
        userId: buyer.id,
        venueId: venue.id,
        amount: 1000,
      });
      const body = finikWebhookBody(created);

      await http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);
      await t.ds.query(`UPDATE certificates SET "validUntil" = now() - interval '1 day'`);

      const res = await get(`/api/admin/orders/${created.id}`).expect(200);

      expect(res.body).toMatchObject({
        id: created.id,
        status: "paid",
        finikTransactionId: `320259584_${created.id}_DEBIT`,
        buyer: { userId: buyer.id, telegramId: buyer.telegramId },
        certificate: { code: expect.any(String), status: "expired" },
        webhooks: [{ result: "paid", amount: 1000 }],
        resolutions: [],
      });
      expect(res.body.certificate).not.toHaveProperty("usedAt");
      expect(res.body.certificateCode).toBe(res.body.certificate.code);
    });

    it("needs_review resolved by hand: the webhook amount and the resolution trail", async () => {
      const created = await createOrder(t.ds, {
        userId: buyer.id,
        venueId: venue.id,
        amount: 1000,
      });
      const body = finikWebhookBody(created, { amount: 990 });

      await http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);
      await resolveNeedsReview(t.ds, {
        orderId: created.id,
        action: OrderResolutionAction.Refunded,
        note: "returned 990 KGS",
        resolvedBy: "alisher",
      });

      const res = await get(`/api/admin/orders/${created.id}`).expect(200);

      expect(res.body).toMatchObject({
        status: "refunded",
        webhooks: [{ result: "needs_review: amount_mismatch", amount: 990 }],
        resolutions: [
          {
            action: "refunded",
            fromStatus: "needs_review",
            toStatus: "refunded",
            note: "returned 990 KGS",
            resolvedBy: "alisher",
            resolvedAt: expect.any(String),
          },
        ],
      });
      expect(res.body).not.toHaveProperty("certificate");
      expect(res.body.resolutions[0]).not.toHaveProperty("certificateCode");
    });

    it("a used certificate carries usedAt", async () => {
      const paid = await order(1, OrderStatus.Paid);

      await t.ds.query(
        `UPDATE certificates SET status = $1, "usedAt" = now() WHERE "orderId" = $2`,
        [CertificateStatus.Used, paid.id],
      );

      expect(
        (await get(`/api/admin/orders/${paid.id}`).expect(200)).body.certificate,
      ).toMatchObject({
        status: "used",
        usedAt: expect.any(String),
      });
    });

    it("404 unknown, 400 not a uuid, 403 for a merchant", async () => {
      await get("/api/admin/orders/5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10").expect(404);
      await get("/api/admin/orders/nope").expect(400);
      await get(
        "/api/admin/orders/5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
        await createUser(t.ds, { role: "merchant" }),
      ).expect(403);
    });
  });
});
