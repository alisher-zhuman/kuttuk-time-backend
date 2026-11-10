import request from "supertest";

import { TelegramBotService } from "../../src/telegram/telegram-bot.service";
import { botWebhookSecret } from "../../src/telegram/bot-webhook-secret";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import { User } from "../../src/users/entities/user.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";
import { initDataFields, signInitData } from "../helpers/init-data";

// The admin's support tools: is an owner connected, payout details, every debt at once, /id.
describe("admin support (integration)", () => {
  let t: TestApp;
  let admin: User;

  const http = () => request(t.app.getHttpServer());
  const as = (req: request.Test, user = admin) => req.auth(t.tokenFor(user), { type: "bearer" });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    admin = await createUser(t.ds, { role: "admin" });
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("merchants: payout details, contact, the owner's state", () => {
    it("a new merchant: notes saved (trimmed), the owner never seen", async () => {
      const res = await as(http().post("/api/admin/merchants"))
        .send({
          name: "Coffeeroom",
          telegramId: 123456,
          payoutDetails: " Mbank 0555 ",
          contact: "",
        })
        .expect(201);

      expect(res.body).toMatchObject({
        payoutDetails: "Mbank 0555",
        contact: null,
        owner: { lastSeenAt: null, botReachable: null },
      });
    });

    it("the owner logged in → lastSeenAt; a refused bot message → botReachable false", async () => {
      const merchant = await createMerchant(t.ds, { telegramId: 5_550_001 });

      await http()
        .post("/api/auth/log-in")
        .send({ initData: signInitData(initDataFields(5_550_001), process.env.BOT_TOKEN ?? "") })
        .expect(200);
      await t.ds.query(`UPDATE users SET "botReachable" = false WHERE "telegramId" = 5550001`);

      const list = (await as(http().get("/api/admin/merchants")).expect(200)).body;
      const one = (await as(http().get(`/api/admin/merchants/${merchant.id}`)).expect(200)).body;

      for (const account of [list[0], one]) {
        expect(account.owner).toEqual({ lastSeenAt: expect.any(String), botReachable: false });
      }
    });

    it("PATCH sets and clears the notes; the owner's own cabinet never shows them", async () => {
      const owner = await createUser(t.ds, { role: "merchant" });
      const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
      const patch = (body: object) =>
        as(http().patch(`/api/admin/merchants/${merchant.id}`)).send(body);

      expect(
        (await patch({ payoutDetails: "Optima 4169", contact: "+996 555 1" }).expect(200)).body,
      ).toMatchObject({ payoutDetails: "Optima 4169", contact: "+996 555 1" });
      expect((await patch({ name: "Renamed" }).expect(200)).body.payoutDetails).toBe("Optima 4169");
      expect((await patch({ payoutDetails: null, contact: " " }).expect(200)).body).toMatchObject({
        payoutDetails: null,
        contact: null,
      });
      await patch({ contact: "x".repeat(501) }).expect(400);

      await patch({ payoutDetails: "Optima 4169" }).expect(200);
      const own = (await as(http().get("/api/merchants/me"), owner).expect(200)).body;

      expect(own).not.toHaveProperty("payoutDetails");
      expect(own).not.toHaveProperty("contact");
    });
  });

  it("users.botReachable follows the real Bot API answers", async () => {
    const user = await createUser(t.ds);
    const bot = new TelegramBotService(t.ds);
    const fetchMock = jest.spyOn(global, "fetch");
    const reachable = async () =>
      (await t.ds.getRepository(User).findOneByOrFail({ id: user.id })).botReachable;

    try {
      fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
      await bot.send({ chatId: user.telegramId, html: "x" });
      expect(await reachable()).toBe(true);

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ description: "Forbidden: bot was blocked by the user" }), {
          status: 403,
        }),
      );
      await bot.send({ chatId: user.telegramId, html: "x" });
      expect(await reachable()).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });

  describe("payouts", () => {
    const bishkek = (local: string) => new Date(`${local}+06:00`);

    it("GET /admin/payouts/due: every debt, by merchant and week, oldest first", async () => {
      const buyer = await createUser(t.ds);
      const a = await createVenue(t.ds, { name: "A" });
      const b = await createVenue(t.ds, { name: "B" });
      const sale = (venueId: number, amount: number, paidAt: Date, payoutId?: string) =>
        createOrder(t.ds, {
          userId: buyer.id,
          venueId,
          amount,
          status: OrderStatus.Paid,
          paidAt,
          ...(payoutId ? { payoutId } : {}),
        });

      await sale(a.id, 1000, bishkek("2026-10-26T00:30:00")); // Monday 26.10, Bishkek
      await sale(a.id, 15, bishkek("2026-10-25T23:30:00")); // Sunday - the week before
      await sale(a.id, 15, bishkek("2026-10-24T12:00:00"));
      await sale(b.id, 500, bishkek("2026-11-03T12:00:00"));
      await createOrder(t.ds, {
        userId: buyer.id,
        venueId: b.id,
        amount: 2000,
        status: OrderStatus.NeedsReview,
        paidAt: bishkek("2026-11-03T12:00:00"),
      });

      const res = (await as(http().get("/api/admin/payouts/due")).expect(200)).body;

      expect(res).toEqual({
        merchants: [
          {
            merchantId: a.merchantId,
            merchantName: expect.any(String),
            due: 27 + 900,
            weeks: [
              { from: "2026-10-19", to: "2026-10-25", ordersCount: 2, due: 27 },
              { from: "2026-10-26", to: "2026-11-01", ordersCount: 1, due: 900 },
            ],
          },
          {
            merchantId: b.merchantId,
            merchantName: expect.any(String),
            due: 450,
            weeks: [{ from: "2026-11-02", to: "2026-11-08", ordersCount: 1, due: 450 }],
          },
        ],
        total: 1377,
      });

      // Paying a week out removes it.
      await as(http().post("/api/admin/payouts"))
        .send({ merchantId: b.merchantId, week: "2026-11-03" })
        .expect(201);
      expect((await as(http().get("/api/admin/payouts/due")).expect(200)).body.total).toBe(927);
      await as(http().get("/api/admin/payouts/due"), buyer).expect(403);
    });

    it("POST /admin/payouts: ownerNotified false when the bot can't reach the owner", async () => {
      const buyer = await createUser(t.ds);
      const venue = await createVenue(t.ds);

      await createOrder(t.ds, {
        userId: buyer.id,
        venueId: venue.id,
        amount: 1000,
        status: OrderStatus.Paid,
        paidAt: bishkek("2026-10-21T12:00:00"),
      });
      t.bot.deliver = false;

      const res = await as(http().post("/api/admin/payouts"))
        .send({ merchantId: venue.merchantId, week: "2026-10-21" })
        .expect(201);

      expect(res.body).toMatchObject({ payout: 900, ownerNotified: false });
    });
  });

  it("/id in the bot → the person's Telegram ID, copyable", async () => {
    await http()
      .post("/api/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", botWebhookSecret()!)
      .send({
        update_id: 1,
        message: {
          text: "/id",
          chat: { id: 555_000_222, type: "private" },
          from: { id: 555_000_222, is_bot: false, language_code: "ru" },
        },
      })
      .expect(200);
    await waitFor(() => t.bot.sent.length === 1);

    expect(t.bot.sent[0]).toEqual({
      chatId: 555_000_222,
      html: "Ваш Telegram ID: <code>555000222</code>\n\nНажмите на число, чтобы скопировать.",
    });
  });
});
