import request from "supertest";

import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import type { Merchant } from "../../src/merchants/entities/merchant.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import {
  createCertificate,
  createMerchant,
  createOrder,
  createUser,
  createVenue,
} from "../helpers/factories";

const DAY = 24 * 60 * 60 * 1000;

describe("merchant redemption (integration)", () => {
  let t: TestApp;
  let owner: User;
  let merchant: Merchant;
  let venue: Venue;
  let buyer: User;

  const http = () => request(t.app.getHttpServer());
  const as = (user: User, req: request.Test) => req.auth(t.tokenFor(user), { type: "bearer" });
  const lookup = (code: string, user = owner) =>
    as(user, http().get(`/api/merchants/me/certificates/${encodeURIComponent(code)}`));
  const redeem = (code: string, user = owner) =>
    as(user, http().post(`/api/merchants/me/certificates/${encodeURIComponent(code)}/redeem`));

  const issue = async (
    fields: Partial<Certificate> & { code: string },
    forVenue: Venue = venue,
  ): Promise<Certificate> => {
    const order = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: forVenue.id,
      status: OrderStatus.Paid,
      paidAt: new Date(),
    });

    return createCertificate(t.ds, {
      orderId: order.id,
      venueId: forVenue.id,
      ownerUserId: buyer.id,
      ...fields,
    });
  };

  const stored = (code: string) => t.ds.getRepository(Certificate).findOneByOrFail({ code });

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

  describe("GET /api/merchants/me/certificates/:code", () => {
    it("shows an active certificate — no usedAt key", async () => {
      const cert = await issue({ code: "12345678", amount: 2000 });

      const res = await lookup("12345678").expect(200);

      expect(res.body).toEqual({
        code: "12345678",
        amount: 2000,
        status: "active",
        validUntil: cert.validUntil.toISOString(),
        createdAt: expect.any(String),
        venue: { id: venue.id, name: venue.name },
      });
      expect(res.body).not.toHaveProperty("usedAt");
    });

    it.each(["1234 5678", "1234-5678", " 1234  5678 ", "12345678"])(
      "normalizes %p",
      async (input) => {
        await issue({ code: "12345678" });

        expect((await lookup(input).expect(200)).body.code).toBe("12345678");
      },
    );

    it("effective status: active past validUntil → expired; used → usedAt", async () => {
      await issue({ code: "11112222", validUntil: new Date(Date.now() - DAY) });
      await issue({
        code: "22222222",
        status: CertificateStatus.Used,
        usedAt: new Date("2026-10-19T10:00:00Z"),
      });

      expect((await lookup("11112222").expect(200)).body).toMatchObject({ status: "expired" });
      expect((await lookup("22222222").expect(200)).body).toMatchObject({
        status: "used",
        usedAt: "2026-10-19T10:00:00.000Z",
      });
    });

    it("another merchant's certificate is a plain 404, same as a missing one", async () => {
      const other = await createVenue(t.ds); // another merchant's venue

      await issue({ code: "77772345" }, other);

      const foreign = await lookup("77772345").expect(404);
      const missing = await lookup("99992345").expect(404);

      expect(foreign.body).toEqual(missing.body);
    });

    it("400 on something that can't be a code", async () => {
      await lookup("KT-ABC0-2345").expect(400);
      await lookup("hello").expect(400);
    });

    it("403 for a buyer, 401 without a token", async () => {
      await issue({ code: "12345678" });

      await lookup("12345678", buyer).expect(403);
      await http().get("/api/merchants/me/certificates/12345678").expect(401);
    });
  });

  describe("POST /api/merchants/me/certificates/:code/redeem", () => {
    it("tells the certificate's owner in the bot — once, and only on success", async () => {
      await t.ds.query(`UPDATE users SET language = 'ru' WHERE id = $1`, [buyer.id]);
      await issue({ code: "12345678", amount: 500 });

      await redeem("12345678").expect(200);
      await waitFor(() => t.bot.sent.length === 1);

      expect(t.bot.sent[0]).toMatchObject({
        chatId: buyer.telegramId,
        button: { text: "Написать в поддержку", url: "https://t.me/alisher_zh" },
      });
      expect(t.bot.sent[0].html).toMatch(
        new RegExp(
          `^✅ Сертификат <code>1234 5678</code> в <b>${venue.name}</b> на 500 сом использован \\d\\d\\.\\d\\d\\.\\d{4} в \\d\\d:\\d\\d\\.`,
        ),
      );

      // A second redeem (409), an expired one (409), a foreign / unknown code (404) send nothing.
      await issue({ code: "22222222", validUntil: new Date(Date.now() - 1000) });
      await redeem("12345678").expect(409);
      await redeem("22222222").expect(409);
      await redeem("99999999").expect(404);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(t.bot.sent).toHaveLength(1);
    });

    it("10 simultaneous redeems → one bot message", async () => {
      await issue({ code: "12345678" });

      await Promise.all(Array.from({ length: 10 }, () => redeem("12345678")));
      await waitFor(() => t.bot.sent.length >= 1);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(t.bot.sent).toHaveLength(1);
    });

    it("redeems: 200 with usedAt; stored as used with usedAt (CHECK holds)", async () => {
      await issue({ code: "12345678" });
      const before = Date.now();

      const res = await redeem("1234 5678").expect(200);

      expect(res.body).toMatchObject({ code: "12345678", status: "used" });
      expect(new Date(res.body.usedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

      const cert = await stored("12345678");

      expect(cert.status).toBe(CertificateStatus.Used);
      expect(cert.usedAt).not.toBeNull();
    });

    it("a second redeem → 409 already_used, usedAt unchanged", async () => {
      await issue({ code: "12345678" });
      await redeem("12345678").expect(200);
      const { usedAt } = await stored("12345678");

      const res = await redeem("12345678").expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: "already_used" });
      expect((await stored("12345678")).usedAt).toEqual(usedAt);
    });

    it("two simultaneous redeems (10 raced) → exactly one 200, the rest 409", async () => {
      await issue({ code: "12345678" });

      const responses = await Promise.all(Array.from({ length: 10 }, () => redeem("12345678")));
      const statuses = responses.map((r) => r.status).sort();

      expect(statuses).toEqual([200, ...Array(9).fill(409)]);
    });

    it("expired (active past validUntil) → 409 expired, stays active in the DB", async () => {
      await issue({ code: "12345678", validUntil: new Date(Date.now() - 1000) });

      const res = await redeem("12345678").expect(409);

      expect(res.body).toMatchObject({ error: "expired" });
      expect((await stored("12345678")).status).toBe(CertificateStatus.Active);
    });

    it("stored expired → 409 expired", async () => {
      await issue({ code: "12345678", status: CertificateStatus.Expired });

      expect((await redeem("12345678").expect(409)).body).toMatchObject({ error: "expired" });
    });

    it("another merchant's certificate → 404 and it is NOT redeemed", async () => {
      const other = await createVenue(t.ds); // another merchant's venue

      await issue({ code: "12345678" }, other);

      await redeem("12345678").expect(404);
      expect((await stored("12345678")).status).toBe(CertificateStatus.Active);
    });

    it("any of the merchant's venues: a certificate of its second venue, venue in the answer", async () => {
      const second = await createVenue(t.ds, { merchantId: merchant.id, name: "Second Shop" });

      await issue({ code: "12345678" }, second);

      expect((await redeem("12345678").expect(200)).body).toMatchObject({
        status: "used",
        venue: { id: second.id, name: "Second Shop" },
      });
    });

    it("a venue moved to another merchant: the new owner redeems what was sold before, the old one can't", async () => {
      const oldOwner = await createUser(t.ds, { role: "merchant" });
      const oldMerchant = await createMerchant(t.ds, { telegramId: oldOwner.telegramId });
      const moved = await createVenue(t.ds, { merchantId: oldMerchant.id });

      await issue({ code: "12345678" }, moved);
      await t.ds.query(`UPDATE venues SET "merchantId" = $1 WHERE id = $2`, [
        merchant.id,
        moved.id,
      ]);

      await redeem("12345678", oldOwner).expect(404);
      await redeem("12345678").expect(200);
    });

    it("a deactivated merchant can still redeem what it sold", async () => {
      await t.ds.query(`UPDATE merchants SET "isActive" = false WHERE id = $1`, [merchant.id]);
      await issue({ code: "12345678" });

      await redeem("12345678").expect(200);
    });

    it("403 for a buyer and for an admin; nothing redeemed", async () => {
      const admin = await createUser(t.ds, { role: "admin" });

      await issue({ code: "12345678" });

      await redeem("12345678", buyer).expect(403);
      await redeem("12345678", admin).expect(403);
      expect((await stored("12345678")).status).toBe(CertificateStatus.Active);
    });

    it("the buyer sees it as used in GET /certificates/my", async () => {
      await issue({ code: "12345678" });
      await redeem("12345678").expect(200);

      const res = await as(buyer, http().get("/api/certificates/my")).expect(200);

      expect(res.body[0]).toMatchObject({
        code: "12345678",
        status: "used",
        usedAt: expect.any(String),
      });
    });
  });
});
