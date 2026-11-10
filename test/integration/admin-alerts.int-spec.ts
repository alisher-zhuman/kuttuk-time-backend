import request from "supertest";

import { FinikNetworkError } from "../../src/finik/finik.errors";
import { FinikWebhookEvent } from "../../src/finik/entities/finik-webhook-event.entity";
import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import { SaleNotifier } from "../../src/orders/sale-notifier";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createOrder, createUser, createVenue } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

// Immediate bot alerts to the admins (AdminAlertsService) - money taken without a certificate,
// a second charge, payments that stop arriving - and the health check for an uptime monitor.
describe("admin alerts and health (integration)", () => {
  let t: TestApp;
  let admins: User[];

  const http = () => request(t.app.getHttpServer());
  const webhook = (body: Record<string, unknown>, headers = signWebhook(body)) =>
    http().post(WEBHOOK_PATH).set(headers).send(body);
  const toAdmins = () => t.bot.sent.filter((m) => admins.some((a) => a.telegramId === m.chatId));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  const pendingOrder = async (amount = 1000) => {
    const buyer = await createUser(t.ds, { language: "ru" });
    const venue = await createVenue(t.ds, { name: "Coffee Shop" });

    return {
      buyer,
      order: await createOrder(t.ds, { userId: buyer.id, venueId: venue.id, amount }),
    };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admins = [await createUser(t.ds, { role: "admin" }), await createUser(t.ds, { role: "admin" })];
  });

  afterAll(async () => {
    await t?.close();
  });

  it("needs_review → every admin gets the order, the amounts and how to resolve it", async () => {
    const { order } = await pendingOrder();

    await webhook(finikWebhookBody(order, { amount: 990 })).expect(200);
    await waitFor(() => toAdmins().length === 2);

    expect(toAdmins()[0].html).toContain("Сумма не совпала");
    expect(toAdmins()[0].html).toContain("заказ 1000 сом, оплачено 990");
    expect(toAdmins()[0].html).toContain(order.id);
    expect(toAdmins()[0].html).toContain("orders:resolve-review");
  });

  describe("a second charge on a settled order", () => {
    it("a different Finik transaction → duplicate_charge, admins alerted, still one certificate", async () => {
      const { order } = await pendingOrder();

      await webhook(finikWebhookBody(order)).expect(200);
      await webhook(finikWebhookBody(order, { id: "second-charge-txn" })).expect(200);
      await waitFor(() => toAdmins().length === 2);

      const results = (
        await t.ds.getRepository(FinikWebhookEvent).find({ order: { receivedAt: "ASC" } })
      ).map((e) => e.result);

      expect(results).toEqual(["paid", "duplicate_charge: paid"]);
      expect(toAdmins()[0].html).toContain("Повторная оплата");
      expect(toAdmins()[0].html).toContain("second-charge-txn");
      expect(await t.ds.getRepository(Certificate).count()).toBe(1);
      expect(
        (await t.ds.getRepository(Order).findOneByOrFail({ id: order.id })).finikTransactionId,
      ).toBe(`320259584_${order.id}_DEBIT`);
    });

    it("the same transaction again (Finik's retry) → already_paid, no alert", async () => {
      const { order } = await pendingOrder();

      await webhook(finikWebhookBody(order)).expect(200);
      await webhook(finikWebhookBody(order)).expect(200);
      await settle();

      expect(toAdmins()).toEqual([]);
    });

    it("on a needs_review order too", async () => {
      const { order } = await pendingOrder();

      await webhook(finikWebhookBody(order, { amount: 990 })).expect(200);
      await waitFor(() => toAdmins().length === 2);
      await webhook(finikWebhookBody(order, { id: "another-txn" })).expect(200);
      await waitFor(() => toAdmins().length === 4);

      expect(toAdmins()[3].html).toContain("Повторная оплата");
    });
  });

  it("an invalid signature → one alert an hour, however many come", async () => {
    const { order } = await pendingOrder();
    const body = finikWebhookBody(order);
    const forged = { ...signWebhook(body), signature: "forged" };

    await webhook(body, forged).expect(401);
    await webhook(body, forged).expect(401);
    await settle();

    expect(toAdmins()).toHaveLength(2); // one message to each of the two admins
    expect(toAdmins()[0].html).toContain("неверной подписью");
  });

  it("a successful payment for an unknown order → alert; a failed one → nothing", async () => {
    const ghost = { id: "00000000-0000-4000-8000-000000000000", amount: 1000 };

    await webhook(finikWebhookBody(ghost, { status: "failed" })).expect(200);
    await settle();
    expect(toAdmins()).toEqual([]);

    await webhook(finikWebhookBody(ghost)).expect(200);
    await waitFor(() => toAdmins().length === 2);
    expect(toAdmins()[0].html).toContain("неизвестному заказу");
  });

  it("Finik fails to create a payment → 502 for the buyer, an alert for the admins", async () => {
    const buyer = await createUser(t.ds);
    const venue = await createVenue(t.ds, { nominals: [1000] });

    t.finik.failWith = new FinikNetworkError("Finik request failed: fetch failed");
    await http()
      .post("/api/orders")
      .auth(t.tokenFor(buyer), { type: "bearer" })
      .send({ venueId: venue.id, nominal: 1000 })
      .expect(502);
    await waitFor(() => toAdmins().length === 2);

    expect(toAdmins()[0].html).toContain("Финик не создал платёж");
  });

  it("no admin can be reached → the webhook still answers 200 and the order is settled", async () => {
    const { order } = await pendingOrder();

    t.bot.deliver = false;
    await webhook(finikWebhookBody(order, { amount: 990 })).expect(200);
    await settle();

    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: order.id })).status).toBe(
      OrderStatus.NeedsReview,
    );
  });

  it("refunded by hand → the buyer is told, with the support button", async () => {
    const { buyer, order } = await pendingOrder(500);

    await t.app.get(SaleNotifier).notifyRefunded(order.id);

    expect(t.bot.sent).toEqual([
      {
        chatId: buyer.telegramId,
        html: `↩️ Деньги за заказ сертификата в <b>Coffee Shop</b> (500 сом) возвращены.\n\nЕсли остались вопросы - напишите нам.\n\nЗаказ №<code>${order.id.slice(0, 8).toUpperCase()}</code>`,
        button: { text: "Написать в поддержку", url: "https://t.me/alisher_zh" },
      },
    ]);
  });

  it("GET /api/health → 200 without a token", async () => {
    expect((await http().get("/api/health").expect(200)).body).toEqual({ status: "ok" });
  });
});
