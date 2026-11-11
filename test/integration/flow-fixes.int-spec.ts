import request from "supertest";

import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { ExpiryRemindersService } from "../../src/certificates/expiry-reminders.service";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import {
  createCertificate,
  createMerchant,
  createOrder,
  createUser,
  createVenue,
} from "../helpers/factories";

// Task 6 (2026-11-10): the venue's place, the giver's name, and the flow-audit fixes
// (Ж5 search by description, Ж6 a stale pending order, Е4 Finik's page language, Е2 retry).
describe("venue place, giver name, flow fixes (integration)", () => {
  let t: TestApp;
  let buyer: User;

  const http = () => request(t.app.getHttpServer());
  const as = (req: request.Test, user: User) => req.auth(t.tokenFor(user), { type: "bearer" });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    buyer = await createUser(t.ds, { language: "ru", firstName: "Айбек" });
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("venue address and map link", () => {
    let owner: User;
    let venue: Venue;
    const patch = (body: object) =>
      as(http().patch(`/api/merchants/me/venues/${venue.id}`), owner).send(body);

    beforeEach(async () => {
      owner = await createUser(t.ds, { role: "merchant" });
      venue = await createVenue(t.ds, {
        merchantId: (await createMerchant(t.ds, { telegramId: owner.telegramId })).id,
      });
    });

    it("the owner sets them (trimmed); buyers see them; required - blank or null → 400", async () => {
      await patch({
        address: "  ул. Киевская 95, 2 этаж ",
        mapUrl: "https://2gis.kg/bishkek/firm/70000001234567",
      }).expect(200);

      expect(
        (await as(http().get(`/api/venues/${venue.slug}`), buyer).expect(200)).body,
      ).toMatchObject({
        address: "ул. Киевская 95, 2 этаж",
        mapUrl: "https://2gis.kg/bishkek/firm/70000001234567",
      });

      for (const body of [{ address: " " }, { address: null }, { mapUrl: "" }, { mapUrl: null }]) {
        await patch(body).expect(400);
      }

      // Omitted (a partial PATCH) keeps them.
      expect((await patch({ validityMonths: 6 }).expect(200)).body.address).toBe(
        "ул. Киевская 95, 2 этаж",
      );
    });

    it.each([
      "https://go.2gis.com/abc12",
      "https://maps.app.goo.gl/AbCdEf123",
      "https://www.google.com/maps/place/Bishkek",
      "https://yandex.kg/maps/-/CDabc",
    ])("a map link %s is accepted", async (mapUrl) => {
      await patch({ mapUrl }).expect(200);
    });

    it.each([
      "http://2gis.kg/bishkek", // not https
      "https://evil.example/2gis.kg/", // another site
      "https://2gis.kg.evil.example/", // a look-alike host
      "javascript:alert(1)",
      "https://2gis.kg/a b", // whitespace
    ])("a map link %s → 400", async (mapUrl) => {
      await patch({ mapUrl }).expect(400);
    });

    it("an address longer than 200 → 400", async () => {
      await patch({ address: "x".repeat(201) }).expect(400);
    });
  });

  it("gift preview: «from» = the giver's first name from Telegram", async () => {
    const venue = await createVenue(t.ds);
    const order = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: venue.id,
      status: OrderStatus.Paid,
      paidAt: new Date(),
    });
    const cert = await createCertificate(t.ds, {
      orderId: order.id,
      venueId: venue.id,
      ownerUserId: buyer.id,
      code: "04718263",
    });

    await as(http().post(`/api/certificates/${cert.id}/share`), buyer).expect(200);

    const url = (
      t.bot.calls[0].payload.result as {
        reply_markup: { inline_keyboard: Array<Array<{ url?: string }>> };
      }
    ).reply_markup.inline_keyboard[0][0].url!;
    const token = new URL(url).searchParams.get("startapp")!.replace(/^gift_/, "");
    const friend = await createUser(t.ds);

    expect((await as(http().get(`/api/gifts/${token}`), friend).expect(200)).body.from).toBe(
      "Айбек",
    );
  });

  it("Ж5: the storefront search finds by the description in any language, never by its keys", async () => {
    const coffee = await createVenue(t.ds, {
      name: "Coffeeroom",
      description: { ru: "Лучший кофе", kg: "Эң жакшы кофе", en: "Best coffee" },
    });

    await createVenue(t.ds, {
      name: "Spa",
      description: { ru: "Массаж", kg: "Массаж", en: "Spa" },
    });

    for (const search of ["кофе", "Coffee", "coffeeroom"]) {
      const res = await as(
        http().get(`/api/venues?search=${encodeURIComponent(search)}`),
        buyer,
      ).expect(200);

      expect(res.body.map((v: { id: number }) => v.id)).toEqual([coffee.id]);
    }

    // "ru" is a key of every description - it must not match all venues.
    expect((await as(http().get("/api/venues?search=ru"), buyer).expect(200)).body).toEqual([]);
  });

  it("Ж6: a pending order past expiresAt reads as expired, without its payment link", async () => {
    const venue = await createVenue(t.ds);
    const order = await createOrder(t.ds, {
      userId: buyer.id,
      venueId: venue.id,
      paymentUrl: "https://pay.test/x",
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await as(http().get(`/api/orders/${order.id}`), buyer).expect(200);

    expect(res.body).toMatchObject({ status: "expired", paymentUrl: null });
    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: order.id })).status).toBe(
      OrderStatus.Expired,
    );
  });

  it.each([
    ["kg", "ky"],
    ["en", "en"],
    ["ru", "ru"],
    ["de", "ru"],
  ])("Е4: Finik's payment page in the app's language: %s → %s", async (lang, finikLang) => {
    const venue = await createVenue(t.ds, { nominals: [1000] });

    await as(http().post("/api/orders"), buyer)
      .set("Accept-Language", lang)
      .send({ venueId: venue.id, nominal: 1000 })
      .expect(201);

    expect(t.finik.calls[0].lang).toBe(finikLang);
  });

  describe("Е2: the expiry reminder after a failed send", () => {
    const run = new Date(Date.now() + 864e5);

    run.setUTCHours(6, 0, 0, 0); // 12:00 in Bishkek

    const expiring = async () => {
      const venue = await createVenue(t.ds);
      const order = await createOrder(t.ds, {
        userId: buyer.id,
        venueId: venue.id,
        status: OrderStatus.Paid,
        paidAt: new Date(),
      });

      return createCertificate(t.ds, {
        orderId: order.id,
        venueId: venue.id,
        ownerUserId: buyer.id,
        code: "11112222",
        validUntil: new Date(run.getTime() + 3 * 864e5),
      });
    };
    const remindedAt = async (id: string) =>
      (await t.ds.getRepository(Certificate).findOneByOrFail({ id })).expiryRemindedAt;

    it("a network failure → released, the next run sends it again", async () => {
      const cert = await expiring();

      t.bot.deliver = false;
      t.bot.undelivered = "failed";
      expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(1);
      expect(await remindedAt(cert.id)).toBeNull();

      t.bot.deliver = true;
      expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(1);
      expect(await remindedAt(cert.id)).toEqual(run);
      expect(t.bot.sent).toHaveLength(2);
    });

    it("a refusal (blocked the bot) → stays claimed, never retried", async () => {
      const cert = await expiring();

      t.bot.deliver = false;
      expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(1);
      expect(await remindedAt(cert.id)).toEqual(run);
      expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(0);
    });
  });
});
