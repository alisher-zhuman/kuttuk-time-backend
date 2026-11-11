import { createHash, createHmac } from "node:crypto";
import request from "supertest";

import { Certificate } from "../../src/certificates/entities/certificate.entity";
import { Order } from "../../src/orders/entities/order.entity";
import { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createVenue } from "../helpers/factories";
import { finikWebhookBody, signWebhook, WEBHOOK_PATH } from "../helpers/finik-webhook";

// An independent signer for the Telegram Login Widget
// (https://core.telegram.org/widgets/login#checking-authorization): secret = SHA-256(bot token),
// hash = hex HMAC-SHA-256(secret, sorted "key=value" lines without hash).
const signWidget = (fields: Record<string, string | number>, botToken = process.env.BOT_TOKEN!) => {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();

  return { ...fields, hash: createHmac("sha256", secret).update(dataCheckString).digest("hex") };
};
const nowSec = () => Math.floor(Date.now() / 1000);
const widgetUser = (id: number, extra: Record<string, string | number> = {}) =>
  signWidget({ id, first_name: "Айбек", username: "aibek", auth_date: nowSec(), ...extra });

// «Войти через Telegram» on the website (docs/web-version.md, stage 3).
describe("POST /api/auth/telegram-widget (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const widgetLogIn = (authData: object, guestToken?: string) =>
    http()
      .post("/api/auth/telegram-widget")
      .send({ authData, ...(guestToken ? { guestToken } : {}) });
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

  it("valid → the Telegram user (created with its name), a JWT", async () => {
    const res = await widgetLogIn(widgetUser(5_550_101)).expect(200);

    expect(res.body).toEqual({ accessToken: expect.any(String), role: "user", merged: false });
    expect(await users().findOneByOrFail({ telegramId: 5_550_101 })).toMatchObject({
      firstName: "Айбек",
      guestTokenHash: null,
    });
  });

  it("a merchant's owner gets the merchant role, like in the Mini App", async () => {
    await createMerchant(t.ds, { telegramId: 5_550_102 });

    expect((await widgetLogIn(widgetUser(5_550_102)).expect(200)).body.role).toBe("merchant");
  });

  it.each([
    ["a tampered field", () => ({ ...widgetUser(5_550_103), id: 1 })],
    ["another bot's token", () => signWidget({ id: 5_550_103, auth_date: nowSec() }, "1:other")],
    ["no hash", () => ({ id: 5_550_103, auth_date: nowSec() })],
    ["older than 24 h", () => widgetUser(5_550_103, { auth_date: nowSec() - 25 * 3600 })],
    [
      "Mini App initData signing",
      () => {
        // HMAC("WebAppData", token) as the key - valid for initData, not for the widget.
        const fields = { id: 5_550_103, auth_date: nowSec() };
        const key = createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
        const dcs = `auth_date=${fields.auth_date}\nid=${fields.id}`;

        return { ...fields, hash: createHmac("sha256", key).update(dcs).digest("hex") };
      },
    ],
  ])("%s → 401, nobody created", async (_name, data) => {
    await widgetLogIn(data()).expect(401);
    expect(await users().count()).toBe(0);
  });

  it("with the guest's token: their order, certificate and gift link move over; the guest is gone", async () => {
    // A guest's purchase from before 11.11 (guests can't buy any more) - made in the DB.
    const guest = (await http().post("/api/auth/guest").send({}).expect(200)).body;
    const [{ id: guestId }] = await t.ds.query(
      `SELECT "id" FROM "users" WHERE "telegramId" IS NULL ORDER BY "id" DESC LIMIT 1`,
    );
    const venue = await createVenue(t.ds, { nominals: [1000] });
    const { id: orderId } = await createOrder(t.ds, {
      userId: guestId,
      venueId: venue.id,
      amount: 1000,
    });
    const body = finikWebhookBody({ id: orderId, amount: 1000 });

    await http().post(WEBHOOK_PATH).set(signWebhook(body)).send(body).expect(200);
    process.env.WEBSITE_URL = "https://site.example";
    const [cert] = await t.ds.getRepository(Certificate).find();

    await http()
      .post(`/api/certificates/${cert.id}/gift-link`)
      .auth(guest.accessToken, { type: "bearer" })
      .expect(200);
    delete process.env.WEBSITE_URL;

    const res = await widgetLogIn(widgetUser(5_550_104), guest.guestToken).expect(200);

    expect(res.body.merged).toBe(true);

    const tg = await users().findOneByOrFail({ telegramId: 5_550_104 });

    expect(await users().count()).toBe(1); // the guest row is gone
    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: orderId })).userId).toBe(tg.id);

    const mine = (
      await http().get("/api/certificates/my").auth(res.body.accessToken, { type: "bearer" })
    ).body;

    expect(mine.map((c: { id: string }) => c.id)).toEqual([cert.id]);
    expect(
      (await t.ds.query(`SELECT "fromUserId" FROM certificate_gifts`)).map(
        (g: { fromUserId: number }) => g.fromUserId,
      ),
    ).toEqual([tg.id]);

    // Again with the same token - nothing left to move.
    expect(
      (await widgetLogIn(widgetUser(5_550_104), guest.guestToken).expect(200)).body.merged,
    ).toBe(false);
  });

  it("an unknown or malformed guest token → logs in, merges nothing", async () => {
    expect((await widgetLogIn(widgetUser(5_550_105), "A".repeat(32)).expect(200)).body.merged).toBe(
      false,
    );
    expect((await widgetLogIn(widgetUser(5_550_105), "nope").expect(200)).body.merged).toBe(false);
  });
});
