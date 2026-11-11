import request from "supertest";

import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { ExpiryRemindersService } from "../../src/certificates/expiry-reminders.service";
import { RedemptionNotifier } from "../../src/certificates/redemption-notifier";
import { CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import { User } from "../../src/users/entities/user.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createUser, createVenue } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

// Website guests (docs/web-version.md, stage 1): a buyer without Telegram, logged in by a secret
// the browser keeps. Everything keyed by userId works for them; the bot stays silent.
describe("website guests (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const guest = (guestToken?: string) =>
    http()
      .post("/api/auth/guest")
      .set("Accept-Language", "ru")
      .send(guestToken === undefined ? {} : { guestToken });
  const users = () => t.ds.getRepository(User);

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("POST /api/auth/guest", () => {
    it("no token → a new guest: a JWT and a token to keep; only its hash is stored", async () => {
      const res = await guest().expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        role: "user",
        guestToken: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
      });

      const [row] = await users().find();

      expect(row).toMatchObject({ telegramId: null, role: "user", language: "ru" });
      expect(row.guestTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.guestTokenHash).not.toContain(res.body.guestToken);
    });

    it("the same token → the same guest; unknown or malformed → a new one", async () => {
      const first = (await guest().expect(200)).body;

      expect((await guest(first.guestToken).expect(200)).body.guestToken).toBe(first.guestToken);
      expect(await users().count()).toBe(1);

      await guest("A".repeat(32)).expect(200);
      await guest("not a token").expect(200);
      expect(await users().count()).toBe(3);
    });

    it("the DB refuses a guest with a merchant role, and a user with neither Telegram nor a token", async () => {
      await guest().expect(200);

      await expect(
        t.ds.query(`UPDATE users SET role = 'merchant' WHERE "telegramId" IS NULL`),
      ).rejects.toMatchObject({ driverError: { constraint: "users_guest_is_buyer" } });
      await expect(
        t.ds.query(`UPDATE users SET "guestTokenHash" = NULL WHERE "telegramId" IS NULL`),
      ).rejects.toMatchObject({ driverError: { constraint: "users_telegram_or_guest" } });
    });
  });

  it("since 11.11 a guest only browses: buying and claiming a gift → 403 telegram_required", async () => {
    const { accessToken } = (await guest().expect(200)).body;
    const venue = await createVenue(t.ds, { nominals: [1000] });

    await http().get("/api/venues").auth(accessToken, { type: "bearer" }).expect(200);
    expect(
      (
        await http()
          .post("/api/orders")
          .auth(accessToken, { type: "bearer" })
          .send({ venueId: venue.id, nominal: 1000, channel: "web" })
          .expect(403)
      ).body,
    ).toMatchObject({ error: "telegram_required" });
    expect(
      (
        await http()
          .post(`/api/gifts/${"A".repeat(22)}/claim`)
          .auth(accessToken, { type: "bearer" })
          .expect(403)
      ).body,
    ).toMatchObject({ error: "telegram_required" });
  });

  // Guests could buy until 11.11 - their certificates still work the same way.
  describe("a guest's earlier purchase", () => {
    const buy = async () => {
      const { accessToken } = (await guest().expect(200)).body;
      const [{ id: guestId }] = await t.ds.query(
        `SELECT "id" FROM "users" WHERE "telegramId" IS NULL ORDER BY "id" DESC LIMIT 1`,
      );
      const owner = await createUser(t.ds, { role: "merchant" });
      const venue = await createVenue(t.ds, {
        name: "Coffee Shop",
        nominals: [1000],
        merchantId: (await createMerchant(t.ds, { telegramId: owner.telegramId })).id,
      });
      const { id: orderId } = await createOrder(t.ds, {
        userId: guestId,
        venueId: venue.id,
        amount: 1000,
      });
      const body = finikWebhookBody({ id: orderId, amount: 1000 });

      await http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);

      return { accessToken, owner, orderId };
    };

    it("paid → a certificate in their list; only the owner hears about the sale", async () => {
      const { accessToken, owner, orderId } = await buy();

      const mine = (
        await http().get("/api/certificates/my").auth(accessToken, { type: "bearer" }).expect(200)
      ).body;

      expect(mine).toHaveLength(1);
      expect(
        (await http().get(`/api/orders/${orderId}`).auth(accessToken, { type: "bearer" })).body
          .status,
      ).toBe("paid");

      await waitFor(() => t.bot.sent.length === 1);
      expect(t.bot.sent.map((m) => m.chatId)).toEqual([owner.telegramId]);
    });

    it("a Telegram gift card → 400 telegram_required; merchant routes → 403", async () => {
      const { accessToken } = await buy();
      const [cert] = await t.ds.getRepository(Certificate).find();

      expect(
        (
          await http()
            .post(`/api/certificates/${cert.id}/share`)
            .auth(accessToken, { type: "bearer" })
            .expect(400)
        ).body,
      ).toMatchObject({ error: "telegram_required" });
      await http().get("/api/merchants/me").auth(accessToken, { type: "bearer" }).expect(403);
    });

    it("no bot message on redemption; the expiry reminder waits (not claimed) instead of being lost", async () => {
      await buy();
      await waitFor(() => t.bot.sent.length === 1);
      t.bot.sent = [];

      const [cert] = await t.ds.getRepository(Certificate).find();
      const run = new Date(Date.now() + 864e5);

      run.setUTCHours(6, 0, 0, 0); // 12:00 in Bishkek
      await t.ds
        .getRepository(Certificate)
        .update(cert.id, { validUntil: new Date(run.getTime() + 3 * 864e5) });

      expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(0);
      expect(
        (await t.ds.getRepository(Certificate).findOneByOrFail({ id: cert.id })).expiryRemindedAt,
      ).toBeNull();

      await t.ds
        .getRepository(Certificate)
        .update(cert.id, { status: CertificateStatus.Used, usedAt: new Date() });
      await t.app.get(RedemptionNotifier).notifyRedeemed(cert.code);

      expect(t.bot.sent).toEqual([]);
    });
  });
});
