import request from "supertest";

import * as certificateCode from "../../src/certificates/certificate-code";
import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { addMonths } from "../../src/common/utils/add-months";
import { FinikWebhookEvent } from "../../src/finik/entities/finik-webhook-event.entity";
import { FinikWebhookVerifier } from "../../src/finik/finik-webhook.verifier";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import { OrdersService } from "../../src/orders/orders.service";
import { CERTIFICATE_CODE_ATTEMPTS } from "../../src/orders/order-fulfillment";
import { createTestApp, type TestApp } from "../helpers/app";
import { createCertificate, createVenue, createOrder, createUser } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

const CODE = /^[0-9]{8}$/;

describe("POST /api/finik/webhook (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const orders = () => t.ds.getRepository(Order);
  const certificates = () => t.ds.getRepository(Certificate);
  const events = () => t.ds.getRepository(FinikWebhookEvent);

  const post = (body: Record<string, unknown>, headers: Record<string, string>, query = "") =>
    http().post(`${WEBHOOK_PATH}${query}`).set(headers).send(body);

  const setup = async (order: Partial<Order> = {}, validityMonths = 6) => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds, { validityMonths });
    const created = await createOrder(t.ds, {
      userId: user.id,
      venueId: venue.id,
      amount: 1000,
      ...order,
    });

    return { user, venue, order: created };
  };

  const reload = (id: string) => orders().findOneByOrFail({ id });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("valid signature, successful payment", () => {
    it("marks the order paid, issues one certificate with the right validUntil, writes the audit", async () => {
      const { user, venue, order } = await setup({}, 6);
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await post(body, headers).expect(200, { ok: true });

      const paidAt = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
      const paid = await reload(order.id);

      expect(paid).toMatchObject({
        status: OrderStatus.Paid,
        paidAt,
        finikTransactionId: `320259584_${order.id}_DEBIT`,
      });

      const certs = await certificates().find();

      expect(certs).toHaveLength(1);
      expect(certs[0]).toMatchObject({
        orderId: order.id,
        venueId: venue.id,
        ownerUserId: user.id,
        amount: 1000,
        status: "active",
        usedAt: null,
      });
      expect(certs[0].code).toMatch(CODE);
      // paidAt + 6 months (month-end clamping is covered by add-months.spec.ts).
      expect(certs[0].validUntil.toISOString()).toBe("2027-04-20T12:00:00.000Z");
      expect(certs[0].validUntil).toEqual(addMonths(paidAt, venue.validityMonths));

      const [event] = await events().find();

      expect(event).toMatchObject({
        signatureValid: true,
        result: "paid",
        orderId: order.id,
        body,
        headers: { host: expect.any(String), "x-api-timestamp": headers["x-api-timestamp"] },
      });
      expect(Object.keys(event.headers).sort()).toEqual(["host", "x-api-timestamp"]);
    });

    it("the order is visible as paid with its code via GET /api/orders/:id", async () => {
      const { user, order } = await setup();
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body)).expect(200);

      const res = await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(200);

      expect(res.body.status).toBe("paid");
      expect(res.body.certificate.code).toMatch(CODE);
    });

    it.each(["succeeded", "SUCCEEDED", "Succeeded", "success", "SUCCESS", "Success"])(
      "accepts status %p (case-insensitive)",
      async (status) => {
        const { order } = await setup();
        const body = finikWebhookBody(order, { status });

        await post(body, signWebhook(body)).expect(200);

        expect((await reload(order.id)).status).toBe(OrderStatus.Paid);
        expect(await certificates().count()).toBe(1);
      },
    );

    it("verifies the query string too", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body, { query: { source: "finik" } }), "?source=finik").expect(
        200,
      );
      expect((await reload(order.id)).status).toBe(OrderStatus.Paid);
    });

    it("pays an expired order anyway (the money is taken) and issues the certificate", async () => {
      const { order } = await setup({
        status: OrderStatus.Expired,
        expiresAt: new Date(Date.now() - 60_000),
      });
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body)).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.Paid);
      expect(await certificates().count()).toBe(1);
      expect((await events().findOneByOrFail({ orderId: order.id })).result).toBe(
        "paid_after_expiry",
      );
    });

    it("falls back to now() when transactionDate is missing", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { transactionDate: undefined });
      const before = Date.now();

      await post(body, signWebhook(body)).expect(200);

      const { paidAt } = await reload(order.id);

      expect(paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(paidAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });

  describe("audit", () => {
    it("the stored body + headers still verify against the original signature (json keeps key order)", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await post(body, headers).expect(200);

      const event = await events().findOneByOrFail({ orderId: order.id });

      // The fixture's nested keys are not sorted, so a key-reordering column type (jsonb) would fail this.
      expect(Object.keys(event.body as Record<string, unknown>)).toEqual(Object.keys(body));
      expect(Object.keys((event.body as { fields: object }).fields)).toEqual(
        Object.keys(body.fields as object),
      );
      expect(
        t.app.get(FinikWebhookVerifier).verify({
          headers: { ...event.headers, signature: headers.signature },
          query: {},
          body: event.body,
        }),
      ).toBe(true);
    });

    it("an invalid request is audited too, but without its body (anyone can send one)", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { junk: "x".repeat(50_000) });

      await post(body, { ...signWebhook(body), signature: "bm9wZQ==" }).expect(401);

      const [event] = await events().find();

      expect(event).toMatchObject({
        signatureValid: false,
        result: "invalid_signature",
        body: { omitted: "invalid_signature" },
      });
    });
  });

  describe("a validly signed payment that isn't ours", () => {
    it("to another Finik account (data.accountId) → ignored: order untouched, no certificate", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, {
        data: { ...(finikWebhookBody(order).data as object), accountId: "someone-else" },
      });

      await post(body, signWebhook(body)).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.Pending);
      expect(await certificates().count()).toBe(0);
      expect((await events().find())[0].result).toBe("ignored_foreign_account");
    });

    it("without data.accountId → ignored too", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { data: { name_en: "KuttukTime" } });

      await post(body, signWebhook(body)).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.Pending);
    });
  });

  describe("an implausible transactionDate", () => {
    it.each([
      ["seconds instead of ms (→ 1970)", Math.floor(Date.UTC(2026, 9, 20) / 1000)],
      ["a week in the future", Date.now() + 7 * 24 * 60 * 60 * 1000],
      ["garbage", "not a date"],
    ])("%s → paid now instead, certificate valid from now", async (_label, transactionDate) => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { transactionDate });
      const before = Date.now();

      await post(body, signWebhook(body)).expect(200);

      const paid = await reload(order.id);

      expect(paid.status).toBe(OrderStatus.Paid);
      expect(paid.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(paid.paidAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });
  });

  describe("idempotency", () => {
    it("the same webhook twice → one certificate, second is a no-op", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await post(body, headers).expect(200);
      const first = await certificates().find();

      await post(body, headers).expect(200);

      expect(await certificates().find()).toEqual(first);
      expect((await events().find({ order: { receivedAt: "ASC" } })).map((e) => e.result)).toEqual([
        "paid",
        "already_paid",
      ]);
    });

    // A single pair often serializes by luck even without the row lock, so race 10 pairs at once.
    it("two identical webhooks at the same time → exactly one certificate (10 orders raced)", async () => {
      const pairs = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const { order } = await setup();
          const body = finikWebhookBody(order);

          return { order, body, headers: signWebhook(body) };
        }),
      );

      const responses = await Promise.all(
        pairs.flatMap(({ body, headers }) => [post(body, headers), post(body, headers)]),
      );

      expect(new Set(responses.map((r) => r.status))).toEqual(new Set([200]));

      for (const { order } of pairs) {
        expect(await certificates().countBy({ orderId: order.id })).toBe(1);

        const results = (await events().findBy({ orderId: order.id })).map((e) => e.result);

        expect(results.sort()).toEqual(["already_paid", "paid"]);
      }
    });

    it("five concurrent deliveries → still exactly one certificate", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await Promise.all(Array.from({ length: 5 }, () => post(body, headers).expect(200)));

      expect(await certificates().count()).toBe(1);
    });
  });

  describe("rejected signatures → 401, order untouched", () => {
    const expectUntouched = async (orderId: string) => {
      expect((await reload(orderId)).status).toBe(OrderStatus.Pending);
      expect(await certificates().count()).toBe(0);

      const [event] = await events().find();

      expect(event).toMatchObject({ signatureValid: false, result: "invalid_signature" });
    };

    it("garbage signature", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);

      await post(body, { ...signWebhook(body), signature: "bm90IGEgc2lnbmF0dXJl" }).expect(401);
      await expectUntouched(order.id);
    });

    it("missing signature header", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      delete headers.signature;

      await post(body, headers).expect(401);
      await expectUntouched(order.id);
    });

    it("a body field changed after signing (top-level amount)", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await post({ ...body, amount: 1 }, headers).expect(401);
      await expectUntouched(order.id);
    });

    it("a nested body field changed after signing", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);
      const fields = body.fields as Record<string, unknown>;

      await post({ ...body, fields: { ...fields, name: "Tampered" } }, headers).expect(401);
      await expectUntouched(order.id);
    });

    it("x-api-timestamp changed after signing", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);
      const headers = signWebhook(body);

      await post(body, { ...headers, "x-api-timestamp": "1" }).expect(401);
      await expectUntouched(order.id);
    });

    it("signed for another host", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body, { host: "evil.example" })).expect(401);
      await expectUntouched(order.id);
    });

    it("signed for another path (without /api)", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body, { path: "/finik/webhook" })).expect(401);
      await expectUntouched(order.id);
    });

    it("is public and not throttled: 65 bad requests in a row are all 401, none 429", async () => {
      const statuses = new Set<number>();

      for (let i = 0; i < 65; i++) {
        const res = await post({ i }, { signature: "x" });

        statuses.add(res.status);
      }

      expect([...statuses]).toEqual([401]);
    });
  });

  describe("valid signature, nothing to do → 200", () => {
    it("unknown paymentId: nothing created", async () => {
      const { order } = await setup();
      const body = finikWebhookBody({ id: "00000000-0000-4000-8000-000000000000", amount: 1000 });

      await post(body, signWebhook(body)).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.Pending);
      expect(await certificates().count()).toBe(0);
      expect(await events().findOneByOrFail({ signatureValid: true })).toMatchObject({
        result: "order_not_found",
        orderId: null,
      });
    });

    it("paymentId that isn't a uuid: 200, not a 500 retry loop", async () => {
      const body = finikWebhookBody({ id: "not-a-uuid", amount: 1000 });

      await post(body, signWebhook(body)).expect(200);
      expect((await events().find())[0].result).toBe("order_not_found");
    });

    it.each(["failed", "pending", "CANCELLED"])(
      "non-success status %p: order untouched",
      async (status) => {
        const { order } = await setup();
        const body = finikWebhookBody(order, { status });

        await post(body, signWebhook(body)).expect(200);

        expect((await reload(order.id)).status).toBe(OrderStatus.Pending);
        expect(await certificates().count()).toBe(0);
        expect((await events().find())[0]).toMatchObject({
          result: `ignored_status: ${status}`,
          orderId: order.id,
        });
      },
    );
  });

  describe("amount mismatch", () => {
    it("→ needs_review, no certificate; GET returns needs_review as is", async () => {
      const { user, order } = await setup();
      const body = finikWebhookBody(order, { amount: 999 });

      await post(body, signWebhook(body)).expect(200);

      expect(await reload(order.id)).toMatchObject({
        status: OrderStatus.NeedsReview,
        paidAt: new Date(Date.UTC(2026, 9, 20, 12, 0, 0)),
        finikTransactionId: `320259584_${order.id}_DEBIT`,
      });
      expect(await certificates().count()).toBe(0);
      expect((await events().find())[0].result).toBe("needs_review: amount_mismatch");

      const res = await http()
        .get(`/api/orders/${order.id}`)
        .auth(t.tokenFor(user), { type: "bearer" })
        .expect(200);

      expect(res.body).toMatchObject({
        status: "needs_review",
        certificate: null,
        paymentUrl: null,
      });
    });

    it("needs_review without transactionDate: paidAt falls back to now()", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { amount: 999, transactionDate: undefined });
      const before = Date.now();

      await post(body, signWebhook(body)).expect(200);

      const { status, paidAt } = await reload(order.id);

      expect(status).toBe(OrderStatus.NeedsReview);
      expect(paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(paidAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it("a retry on an order already refunded by hand → 200, already_refunded, untouched", async () => {
      const { order } = await setup({ status: OrderStatus.Refunded });
      const body = finikWebhookBody(order);

      await post(body, signWebhook(body)).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.Refunded);
      expect(await certificates().count()).toBe(0);
      expect((await events().find())[0]).toMatchObject({
        result: "already_refunded",
        orderId: order.id,
      });
    });

    it("a retry of a needs_review webhook stays a no-op", async () => {
      const { order } = await setup();
      const body = finikWebhookBody(order, { amount: 999 });
      const headers = signWebhook(body);

      await post(body, headers).expect(200);
      await post(body, headers).expect(200);

      expect((await reload(order.id)).status).toBe(OrderStatus.NeedsReview);
      expect((await events().find({ order: { receivedAt: "ASC" } }))[1].result).toBe(
        "already_needs_review",
      );
    });
  });

  describe("certificate code collisions", () => {
    it("retries with a new code when the generated one is taken", async () => {
      const { order, user, venue } = await setup();
      const other = await createOrder(t.ds, { userId: user.id, venueId: venue.id });

      await createCertificate(t.ds, {
        orderId: other.id,
        venueId: venue.id,
        ownerUserId: user.id,
        code: "33332222",
      });

      jest
        .spyOn(certificateCode, "generateCertificateCode")
        .mockReturnValueOnce("33332222")
        .mockReturnValueOnce("33332222")
        .mockReturnValueOnce("44443333");

      const body = finikWebhookBody(order);

      await post(body, signWebhook(body)).expect(200);

      expect((await certificates().findOneByOrFail({ orderId: order.id })).code).toBe("44443333");
    });

    it(`gives up after ${CERTIFICATE_CODE_ATTEMPTS} taken codes: 500, everything rolled back, audit kept`, async () => {
      const { order, user, venue } = await setup();
      const other = await createOrder(t.ds, { userId: user.id, venueId: venue.id });

      await createCertificate(t.ds, {
        orderId: other.id,
        venueId: venue.id,
        ownerUserId: user.id,
        code: "33332222",
      });

      const spy = jest
        .spyOn(certificateCode, "generateCertificateCode")
        .mockReturnValue("33332222");

      const body = finikWebhookBody(order);

      await post(body, signWebhook(body)).expect(500);

      expect(spy).toHaveBeenCalledTimes(CERTIFICATE_CODE_ATTEMPTS);
      expect(await reload(order.id)).toMatchObject({
        status: OrderStatus.Pending,
        paidAt: null,
        finikTransactionId: null,
      });
      expect(await certificates().countBy({ orderId: order.id })).toBe(0);
      expect((await events().find())[0].result).toMatch(/^error: Could not generate/);
    });
  });

  describe("expiry cron", () => {
    it("does not touch needs_review or paid orders, even past expiresAt", async () => {
      const past = new Date(Date.now() - 60_000);
      const { order: review } = await setup({ status: OrderStatus.NeedsReview, expiresAt: past });
      const { order: paid } = await setup({
        status: OrderStatus.Paid,
        paidAt: new Date(),
        expiresAt: past,
      });
      const { order: stale } = await setup({ expiresAt: past });

      await expect(t.app.get(OrdersService).expireStale()).resolves.toBe(1);

      expect((await reload(review.id)).status).toBe(OrderStatus.NeedsReview);
      expect((await reload(paid.id)).status).toBe(OrderStatus.Paid);
      expect((await reload(stale.id)).status).toBe(OrderStatus.Expired);
    });
  });
});
