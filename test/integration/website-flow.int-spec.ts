import request from "supertest";

import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createUser, createVenue } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

const SITE = "https://kuttuk-time.example";

// The website's buying and gifting (docs/web-version.md, stage 2): back to the website after
// paying, and «Подарить» as a link for the phone's share menu.
describe("website: payment return and gift links (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const asGuest = async () => (await http().post("/api/auth/guest").send({}).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    process.env.WEBSITE_URL = `${SITE}/`;
  });

  afterAll(async () => {
    delete process.env.WEBSITE_URL;
    await t?.close();
  });

  // A guest buys on the website; the certificate is issued by the webhook.
  const buyOnWebsite = async () => {
    const { accessToken } = await asGuest();
    const venue = await createVenue(t.ds, { nominals: [1000] });
    const { orderId } = (
      await http()
        .post("/api/orders")
        .auth(accessToken, { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000, channel: "web" })
        .expect(201)
    ).body;
    const body = finikWebhookBody({ id: orderId, amount: 1000 });

    await http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);

    return { accessToken, orderId };
  };

  describe("after paying", () => {
    it("a website order asks Finik to return to /web; a Mini App order - as before", async () => {
      const buyer = await createUser(t.ds);
      const venue = await createVenue(t.ds, { nominals: [1000] });
      const order = (channel?: string) =>
        http()
          .post("/api/orders")
          .auth(t.tokenFor(buyer), { type: "bearer" })
          .send({ venueId: venue.id, nominal: 1000, ...(channel ? { channel } : {}) })
          .expect(201);

      const web = (await order("web")).body.orderId;
      const tma = (await order()).body.orderId;

      expect(t.finik.calls.map((c) => c.redirectUrl)).toEqual([
        `http://localhost/api/payments/return/${web}/web`,
        `http://localhost/api/payments/return/${tma}`,
      ]);
      await http()
        .post("/api/orders")
        .auth(t.tokenFor(buyer), { type: "bearer" })
        .send({ venueId: venue.id, nominal: 1000, channel: "sms" })
        .expect(400);
    });

    it("/web → 302 to the website's order page (Finik's query ignored); no website → the Mini App", async () => {
      const id = "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10";

      expect(
        (
          await http()
            .get(`/api/payments/return/${id}/web?paymentId=x&status=succeeded`)
            .expect(302)
        ).headers.location,
      ).toBe(`${SITE}/orders/${id}`);
      expect((await http().get("/api/payments/return/nope/web").expect(302)).headers.location).toBe(
        SITE,
      );

      delete process.env.WEBSITE_URL;
      expect(
        (await http().get(`/api/payments/return/${id}/web`).expect(302)).headers.location,
      ).toBe(`https://t.me/kuttuk_time_bot/app?startapp=order_${id}`);
    });
  });

  describe("POST /api/certificates/:id/gift-link", () => {
    it("a guest shares a link; a friend opens it on the website and claims the gift", async () => {
      const { accessToken } = await buyOnWebsite();
      const [cert] = await t.ds.getRepository(Certificate).find();

      const { url } = (
        await http()
          .post(`/api/certificates/${cert.id}/gift-link`)
          .auth(accessToken, { type: "bearer" })
          .expect(200)
      ).body;

      expect(url).toMatch(new RegExp(`^${SITE}/gift/[A-Za-z0-9_-]{22}$`));

      const token = url.split("/gift/")[1];
      const friend = await asGuest();

      expect(
        (
          await http()
            .get(`/api/gifts/${token}`)
            .auth(friend.accessToken, { type: "bearer" })
            .expect(200)
        ).body,
      ).toMatchObject({ state: "available", from: null, amount: 1000 });
      await http()
        .post(`/api/gifts/${token}/claim`)
        .auth(friend.accessToken, { type: "bearer" })
        .expect(200);

      const friendsList = (
        await http()
          .get("/api/certificates/my")
          .auth(friend.accessToken, { type: "bearer" })
          .expect(200)
      ).body;

      expect(friendsList.map((c: { id: string }) => c.id)).toEqual([cert.id]);
      // The giver is a guest - no Telegram chat, so no «подарок забрали» message.
      expect(t.bot.sent.some((m) => m.html.includes("подарок забрали"))).toBe(false);
    });

    it("a new link replaces the previous unclaimed one", async () => {
      const { accessToken } = await buyOnWebsite();
      const [cert] = await t.ds.getRepository(Certificate).find();
      const link = async () =>
        (
          await http()
            .post(`/api/certificates/${cert.id}/gift-link`)
            .auth(accessToken, { type: "bearer" })
            .expect(200)
        ).body.url.split("/gift/")[1] as string;
      const first = await link();
      const second = await link();
      const friend = await asGuest();

      await http()
        .get(`/api/gifts/${first}`)
        .auth(friend.accessToken, { type: "bearer" })
        .expect(404);
      await http()
        .get(`/api/gifts/${second}`)
        .auth(friend.accessToken, { type: "bearer" })
        .expect(200);
    });

    it("someone else's → 404; used → 409; no website configured → 503", async () => {
      const { accessToken } = await buyOnWebsite();
      const [cert] = await t.ds.getRepository(Certificate).find();
      const stranger = await asGuest();
      const giftLink = (token: string) =>
        http().post(`/api/certificates/${cert.id}/gift-link`).auth(token, { type: "bearer" });

      await giftLink(stranger.accessToken).expect(404);

      delete process.env.WEBSITE_URL;
      await giftLink(accessToken).expect(503);
      process.env.WEBSITE_URL = SITE;

      await t.ds.query(`UPDATE certificates SET status = 'used', "usedAt" = now()`);
      expect((await giftLink(accessToken).expect(409)).body).toMatchObject({
        error: "already_used",
      });
    });
  });
});
