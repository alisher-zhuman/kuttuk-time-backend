import request from "supertest";

import { formatCertificateCode } from "../../src/certificates/certificate-code";
import { User } from "../../src/users/entities/user.entity";
import type { Order } from "../../src/orders/entities/order.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";
import { initDataFields, signInitData } from "../helpers/init-data";

describe("bot notifications on a sale (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());

  const pay = (order: Order, overrides: Record<string, unknown> = {}) => {
    const body = finikWebhookBody(order, overrides);

    return http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);
  };

  // A buyer, a venue "Coffee <b>&</b> Co" (HTML in the name) of a merchant whose owner may or
  // may not have a users row, and a pending order.
  const setup = async (
    opts: { buyerLanguage?: User["language"]; ownerLanguage?: User["language"] | "no-user" } = {},
  ) => {
    const buyer = await createUser(t.ds, { language: opts.buyerLanguage ?? null });
    const merchant = await createMerchant(t.ds);

    if (opts.ownerLanguage !== "no-user") {
      await createUser(t.ds, {
        telegramId: merchant.telegramId,
        role: "merchant",
        language: opts.ownerLanguage ?? null,
      });
    }

    const venue = await createVenue(t.ds, { merchantId: merchant.id, name: "Coffee <b>&</b> Co" });
    const order = await createOrder(t.ds, { userId: buyer.id, venueId: venue.id, amount: 1000 });

    return { buyer, merchant, venue, order };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("paid → the code to the buyer (their language), 'new sale' to the owner (theirs)", async () => {
    const { buyer, merchant, order } = await setup({ buyerLanguage: "ru", ownerLanguage: "en" });

    await pay(order);
    await waitFor(() => t.bot.sent.length === 2);

    const [{ code }] = await t.ds.query(`SELECT code FROM certificates WHERE "orderId" = $1`, [
      order.id,
    ]);
    const toBuyer = t.bot.sent.find((m) => m.chatId === buyer.telegramId)!;
    const toOwner = t.bot.sent.find((m) => m.chatId === merchant.telegramId)!;

    expect(toBuyer.html).toContain(`Код: <code>${formatCertificateCode(code)}</code>`);
    expect(toBuyer.html).toContain("<b>Coffee &lt;b&gt;&amp;&lt;/b&gt; Co</b> на 1000 сом");
    // validUntil = paidAt (2027-08-31 12:00 UTC) + 12 months, shown in Bishkek time.
    expect(toBuyer.html).toContain("Действует до 31.08.2028");
    expect(toBuyer.button).toEqual({
      text: "Открыть сертификат",
      url: `https://t.me/kuttuk_time_bot/app?startapp=order_${order.id}`,
    });
    // Copies exactly the code (digits, no spaces).
    expect(toBuyer.buttons).toEqual([{ text: "Скопировать код", copyText: code }]);

    expect(toOwner.html).toBe("🎉 New sale: <b>Coffee &lt;b&gt;&amp;&lt;/b&gt; Co</b> — 1000 KGS");
    expect(toOwner.html).not.toContain(code);
    expect(toOwner.button).toEqual({
      text: "Open cabinet",
      url: "https://t.me/kuttuk_time_bot/app",
    });
  });

  it("unknown languages and an owner who never logged in → kg, still sent to the owner's Telegram ID", async () => {
    const { merchant, order } = await setup({ ownerLanguage: "no-user" });

    await pay(order);
    await waitFor(() => t.bot.sent.length === 2);

    expect(t.bot.sent.map((m) => m.button?.text).sort()).toEqual([
      "Кабинетти ачуу",
      "Сертификатты ачуу",
    ]);
    expect(t.bot.sent.some((m) => m.chatId === merchant.telegramId)).toBe(true);
  });

  it("a retried delivery (already_paid) sends nothing more", async () => {
    const { order } = await setup();

    await pay(order);
    await waitFor(() => t.bot.sent.length === 2);
    await pay(order);
    // Give a wrongly fired notification time to land.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(t.bot.sent).toHaveLength(2);
  });

  it("needs_review (amount mismatch) and a non-success status send nothing", async () => {
    const { order } = await setup();
    const other = await setup();

    await pay(order, { amount: 999 });
    await pay(other.order, { status: "failed" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(t.bot.sent).toHaveLength(0);
  });

  it("the webhook answers 200 and the order is paid even if Telegram refuses (403)", async () => {
    const { order } = await setup();

    t.bot.deliver = false;

    await pay(order);
    await waitFor(() => t.bot.sent.length === 2);

    const [{ status }] = await t.ds.query(`SELECT status FROM orders WHERE id = $1`, [order.id]);

    expect(status).toBe("paid");
  });

  describe("remembering the app language", () => {
    const users = () => t.ds.getRepository(User);

    it("log-in stores Accept-Language (ky → kg), an unknown one leaves it as it was", async () => {
      const logIn = (lang: string) =>
        http()
          .post("/api/auth/log-in")
          .set("Accept-Language", lang)
          .send({ initData: signInitData(initDataFields(555), process.env.BOT_TOKEN!) })
          .expect(200);

      await logIn("ru");
      expect((await users().findOneByOrFail({ telegramId: 555 })).language).toBe("ru");

      await logIn("ky");
      expect((await users().findOneByOrFail({ telegramId: 555 })).language).toBe("kg");

      await logIn("de-DE");
      expect((await users().findOneByOrFail({ telegramId: 555 })).language).toBe("kg");
    });

    it("POST /api/orders stores the buyer's current language", async () => {
      const buyer = await createUser(t.ds, { language: "kg" });
      const venue = await createVenue(t.ds);

      await http()
        .post("/api/orders")
        .auth(t.tokenFor(buyer), { type: "bearer" })
        .set("Accept-Language", "en")
        .send({ venueId: venue.id, nominal: 1000 })
        .expect(201);

      expect((await users().findOneByOrFail({ id: buyer.id })).language).toBe("en");
    });

    it("the DB rejects a language outside ru / kg / en", async () => {
      await expect(
        t.ds.query(`INSERT INTO users ("telegramId", language) VALUES (1, 'de')`),
      ).rejects.toMatchObject({ constraint: "users_language_valid" });
    });
  });
});
