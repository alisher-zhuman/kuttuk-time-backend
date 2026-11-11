import request from "supertest";

import { CertificateGift } from "../../src/certificates/entities/certificate-gift.entity";
import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import { ExpiryRemindersService } from "../../src/certificates/expiry-reminders.service";
import { RedemptionNotifier } from "../../src/certificates/redemption-notifier";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createCertificate, createOrder, createUser, createVenue } from "../helpers/factories";

// «Подарить» → «Забрать подарок»: the link in the gift card moves the certificate to the friend.
describe("gifts - claim a gifted certificate (integration)", () => {
  let t: TestApp;
  let buyer: User;
  let friend: User;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());
  const get = (path: string, user: User) =>
    http().get(path).auth(t.tokenFor(user), { type: "bearer" }).set("Accept-Language", "ru");
  const post = (path: string, user: User) =>
    http().post(path).auth(t.tokenFor(user), { type: "bearer" }).set("Accept-Language", "ru");

  // Shares as `owner` and returns the token from the card's «Забрать подарок» button.
  const share = async (certificateId: string, owner: User): Promise<string> => {
    const before = t.bot.calls.length;

    await post(`/api/certificates/${certificateId}/share`, owner).expect(200);

    const result = t.bot.calls[before].payload.result as {
      reply_markup: { inline_keyboard: Array<Array<{ url?: string }>> };
    };
    const url = new URL(result.reply_markup.inline_keyboard[0][0].url!);

    return url.searchParams.get("startapp")!.replace(/^gift_/, "");
  };
  const claim = (token: string, user: User) => post(`/api/gifts/${token}/claim`, user);
  const preview = (token: string, user: User) => get(`/api/gifts/${token}`, user);

  const certificate = async (fields: Partial<Certificate> = {}) => {
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
      amount: 1000,
      code: "04718263",
      validUntil: new Date("2027-10-21T06:00:00Z"),
      ...fields,
    });

    return { order, cert };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    buyer = await createUser(t.ds, { language: "ru" });
    friend = await createUser(t.ds, { language: "ru" });
    venue = await createVenue(t.ds, { name: "Coffee Shop", slug: "coffee-shop" });
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the friend claims it: theirs now, the buyer sees «Подарен» and is told", async () => {
    const { order, cert } = await certificate();
    const token = await share(cert.id, buyer);

    expect((await preview(token, friend).expect(200)).body).toEqual({
      state: "available",
      from: null, // the buyer never logged in through the app here - no name from Telegram
      status: "active",
      amount: 1000,
      validUntil: "2027-10-21T06:00:00.000Z",
      venue: {
        id: venue.id,
        name: "Coffee Shop",
        slug: "coffee-shop",
        logo: venue.logo,
        address: null,
        mapUrl: null,
      },
    });

    const claimed = (await claim(token, friend).expect(200)).body;

    expect(claimed).toMatchObject({ id: cert.id, code: "04718263", status: "active" });
    expect(claimed).not.toHaveProperty("giftedAt");

    const friendList = (await get("/api/certificates/my", friend).expect(200)).body;
    const buyerList = (await get("/api/certificates/my", buyer).expect(200)).body;

    expect(friendList).toEqual([claimed]);
    expect(buyerList).toHaveLength(1);
    expect(buyerList[0]).toMatchObject({ id: cert.id, giftedAt: expect.any(String) });

    const orderView = (await get(`/api/orders/${order.id}`, buyer).expect(200)).body;

    expect(orderView.certificate.giftedAt).toBe(buyerList[0].giftedAt);

    await waitFor(() => t.bot.sent.length === 1);
    expect(t.bot.sent[0]).toEqual({
      chatId: buyer.telegramId,
      html: "🎁 Ваш подарок забрали - сертификат в <b>Coffee Shop</b> на 1000 сом теперь у получателя.",
    });

    // The buyer can't share it any more; the friend can.
    await post(`/api/certificates/${cert.id}/share`, buyer).expect(404);
    await post(`/api/certificates/${cert.id}/share`, friend).expect(200);
  });

  it("states: own, received, claimed by someone else", async () => {
    const { cert } = await certificate();
    const token = await share(cert.id, buyer);
    const stranger = await createUser(t.ds);

    expect((await preview(token, buyer).expect(200)).body.state).toBe("own");
    await claim(token, friend).expect(200);
    expect((await preview(token, friend).expect(200)).body.state).toBe("received");
    expect((await preview(token, stranger).expect(200)).body.state).toBe("claimed");
    expect((await preview(token, buyer).expect(200)).body.state).toBe("claimed");
  });

  it("claim errors: own, already_claimed; a repeat by the same friend → the same 200, one notice", async () => {
    const { cert } = await certificate();
    const token = await share(cert.id, buyer);
    const stranger = await createUser(t.ds);

    expect((await claim(token, buyer).expect(409)).body).toMatchObject({ error: "own" });

    const first = (await claim(token, friend).expect(200)).body;

    expect((await claim(token, friend).expect(200)).body).toEqual(first);
    expect((await claim(token, stranger).expect(409)).body).toMatchObject({
      error: "already_claimed",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.bot.sent).toHaveLength(1);
  });

  it.each([
    ["already_used", { status: CertificateStatus.Used, usedAt: new Date() }],
    ["expired", { validUntil: new Date(Date.now() - 1000) }],
  ])("not usable any more → 409 %s, nothing moves", async (error, fields) => {
    const { cert } = await certificate();
    const token = await share(cert.id, buyer);

    await t.ds.getRepository(Certificate).update(cert.id, fields);

    expect((await claim(token, friend).expect(409)).body).toMatchObject({ error });
    expect(
      (await t.ds.getRepository(Certificate).findOneByOrFail({ id: cert.id })).ownerUserId,
    ).toBe(buyer.id);
  });

  it("unknown, malformed or replaced link → 404", async () => {
    const { cert } = await certificate();
    const old = await share(cert.id, buyer);
    const fresh = await share(cert.id, buyer);

    await preview(old, friend).expect(404);
    await claim(old, friend).expect(404);
    await preview("AAAAAAAAAAAAAAAAAAAAAA", friend).expect(404);
    await preview("nope", friend).expect(404);
    await claim(fresh, friend).expect(200);
    await http().get(`/api/gifts/${fresh}`).expect(401);
  });

  it("five people at once → exactly one gets it", async () => {
    const { cert } = await certificate();
    const token = await share(cert.id, buyer);
    const people = await Promise.all([1, 2, 3, 4, 5].map(() => createUser(t.ds)));

    const codes = (await Promise.all(people.map((p) => claim(token, p)))).map((r) => r.status);

    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(4);
    expect(await t.ds.getRepository(CertificateGift).countBy({ certificateId: cert.id })).toBe(1);
  });

  it("A → B → C: both givers see «Подарен», C owns it", async () => {
    const { cert } = await certificate();
    const third = await createUser(t.ds);

    await claim(await share(cert.id, buyer), friend).expect(200);
    await claim(await share(cert.id, friend), third).expect(200);

    for (const giver of [buyer, friend]) {
      const list = (await get("/api/certificates/my", giver).expect(200)).body;

      expect(list[0].giftedAt).toEqual(expect.any(String));
    }

    const mine = (await get("/api/certificates/my", third).expect(200)).body;

    expect(mine).toHaveLength(1);
    expect(mine[0]).not.toHaveProperty("giftedAt");
  });

  it("redeemed after the claim → the friend gets the usual notice, the giver «Ваш подарок использовали»", async () => {
    const { cert } = await certificate();

    await claim(await share(cert.id, buyer), friend).expect(200);
    await waitFor(() => t.bot.sent.length === 1);
    t.bot.sent = [];

    await t.ds.getRepository(Certificate).update(cert.id, {
      status: CertificateStatus.Used,
      usedAt: new Date("2026-11-10T08:30:00Z"),
    });
    await t.app.get(RedemptionNotifier).notifyRedeemed("04718263");

    expect(t.bot.sent.map((m) => m.chatId)).toEqual([friend.telegramId, buyer.telegramId]);
    expect(t.bot.sent[0].html).toContain("Если это были не вы");
    expect(t.bot.sent[1].html).toBe(
      "🎉 Ваш подарок использовали - сертификат в <b>Coffee Shop</b> на 1000 сом, 10.11.2026.",
    );
  });

  it("the expiry reminder goes to the friend (again, even if the buyer had one), to «Мои сертификаты»", async () => {
    // A daytime run in Bishkek (06:00 UTC = 12:00), the certificate 3 days from it.
    const run = new Date(Date.now() + 864e5);

    run.setUTCHours(6, 0, 0, 0);

    const { cert } = await certificate({
      validUntil: new Date(run.getTime() + 3 * 864e5),
      expiryRemindedAt: new Date(),
    });

    await claim(await share(cert.id, buyer), friend).expect(200);
    await waitFor(() => t.bot.sent.length === 1);
    t.bot.sent = [];

    expect(await t.app.get(ExpiryRemindersService).run(run)).toBe(1);
    expect(t.bot.sent[0].chatId).toBe(friend.telegramId);
    expect(t.bot.sent[0].button?.url).toBe(
      "https://t.me/kuttuk_time_bot/app?startapp=my_certificates",
    );
  });
});
