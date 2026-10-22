import request from "supertest";

import {
  CertificateStatus,
  type Certificate,
} from "../../src/certificates/entities/certificate.entity";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createCertificate, createOrder, createUser, createVenue } from "../helpers/factories";

describe("POST /api/certificates/:id/share — gift card (integration)", () => {
  let t: TestApp;
  let buyer: User;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());
  const share = (id: string, user = buyer, lang = "ru") =>
    http()
      .post(`/api/certificates/${id}/share`)
      .auth(t.tokenFor(user), { type: "bearer" })
      .set("Accept-Language", lang);

  const certificate = async (fields: Partial<Certificate> = {}, owner = buyer) => {
    const order = await createOrder(t.ds, {
      userId: owner.id,
      venueId: venue.id,
      status: OrderStatus.Paid,
      paidAt: new Date(),
    });

    return createCertificate(t.ds, {
      orderId: order.id,
      venueId: venue.id,
      ownerUserId: owner.id,
      amount: 1000,
      code: "04718263",
      validUntil: new Date("2027-10-21T06:00:00Z"),
      ...fields,
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    buyer = await createUser(t.ds);
    venue = await createVenue(t.ds, {
      name: "Coffee <b>&</b> Co",
      slug: "coffeeroom",
      logo: "https://res.cloudinary.com/x/logo.webp",
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  it("stores a card with Telegram for the owner and returns its id", async () => {
    const cert = await certificate();

    const res = await share(cert.id).expect(200);

    expect(res.body).toEqual({
      preparedMessageId: "prepared-1",
      expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
    });
    expect(t.bot.calls).toEqual([
      {
        method: "savePreparedInlineMessage",
        payload: {
          user_id: buyer.telegramId,
          result: {
            type: "photo",
            id: cert.id,
            photo_url: "http://localhost/api/qr/04718263.jpg",
            thumbnail_url: "http://localhost/api/qr/04718263.jpg",
            title: "🎁 Сертификат в Coffee <b>&</b> Co — 1000 сом",
            description: "Код 0471 8263 · до 21.10.2027",
            caption:
              "🎁 Тебе подарок — сертификат в <b>Coffee &lt;b&gt;&amp;&lt;/b&gt; Co</b> на 1000 сом\n\nКод: <code>0471 8263</code>\nДействует до 21.10.2027\n\nПокажи этот QR или код на кассе.",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Открыть Coffee <b>&</b> Co",
                    url: "https://t.me/kuttuk_time_bot/app?startapp=coffeeroom",
                  },
                ],
                [{ text: "Скопировать код", copy_text: { text: "04718263" } }],
              ],
            },
          },
          allow_user_chats: true,
          allow_group_chats: true,
        },
      },
    ]);
  });

  it.each([
    ["en", "A gift for you", "Copy code"],
    ["kg", "Сага белек", "Кодду көчүрүү"],
    ["de", "Сага белек", "Кодду көчүрүү"], // unknown → kg, like the app
  ])("in the app's language: %s", async (lang, text, copy) => {
    const cert = await certificate();

    await share(cert.id, buyer, lang).expect(200);

    const result = t.bot.calls[0].payload.result as {
      caption: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
    };

    expect(result.caption).toContain(text);
    expect(result.reply_markup.inline_keyboard[1][0].text).toBe(copy);
  });

  it("someone else's certificate → 404, nothing stored", async () => {
    const other = await createUser(t.ds);
    const cert = await certificate({}, other);

    await share(cert.id).expect(404);
    expect(t.bot.calls).toHaveLength(0);
  });

  it.each([
    ["already_used", { status: CertificateStatus.Used, usedAt: new Date() }],
    ["expired", { validUntil: new Date(Date.now() - 1000) }],
    ["expired", { status: CertificateStatus.Expired }],
  ])("not active → 409 %s", async (error, fields) => {
    const cert = await certificate(fields as Partial<Certificate>);

    expect((await share(cert.id).expect(409)).body).toMatchObject({ error });
    expect(t.bot.calls).toHaveLength(0);
  });

  it("Telegram fails → 502; not a uuid → 400; no token → 401", async () => {
    const cert = await certificate();

    t.bot.deliver = false;

    await share(cert.id).expect(502);
    await share("nope").expect(400);
    await http().post(`/api/certificates/${cert.id}/share`).expect(401);
  });
});
