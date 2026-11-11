import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose";
import request from "supertest";

import {
  TELEGRAM_OIDC_ISSUER,
  telegramLoginClientId,
  TelegramOidcVerifier,
} from "../../src/auth/telegram-oidc.verifier";
import { Order } from "../../src/orders/entities/order.entity";
import { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createOrder, createVenue } from "../helpers/factories";

// «Log In With Telegram» (OIDC) on the website: the id_token is checked against Telegram's keys -
// here a test key pair stands in for Telegram's JWKS.
describe("POST /api/auth/telegram-oidc (integration)", () => {
  let t: TestApp;
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;

  const http = () => request(t.app.getHttpServer());
  const users = () => t.ds.getRepository(User);
  const logIn = (idToken: string, guestToken?: string) =>
    http()
      .post("/api/auth/telegram-oidc")
      .send({ idToken, ...(guestToken ? { guestToken } : {}) });

  const idToken = (
    claims: Record<string, unknown>,
    opts: { key?: CryptoKey; iss?: string; aud?: string; exp?: string | number } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(opts.iss ?? TELEGRAM_OIDC_ISSUER)
      .setAudience(opts.aud ?? telegramLoginClientId()!)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "10m")
      .sign(opts.key ?? privateKey);

  beforeAll(async () => {
    t = await createTestApp();

    const pair = await generateKeyPair("RS256");
    const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" };

    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;
    // Telegram's JWKS → the test key.
    (t.app.get(TelegramOidcVerifier) as unknown as { keys: unknown }).keys = createLocalJWKSet({
      keys: [publicJwk],
    });
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("a valid id_token → the Telegram user (with the first name), a JWT", async () => {
    const res = await logIn(
      await idToken({ id: 5_550_201, given_name: " Айбек ", preferred_username: "aibek" }),
    ).expect(200);

    expect(res.body).toEqual({ accessToken: expect.any(String), role: "user", merged: false });
    expect(await users().findOneByOrFail({ telegramId: 5_550_201 })).toMatchObject({
      firstName: "Айбек",
    });
  });

  it("a merchant's owner gets the merchant role", async () => {
    await createMerchant(t.ds, { telegramId: 5_550_202 });

    expect((await logIn(await idToken({ id: 5_550_202 })).expect(200)).body.role).toBe("merchant");
  });

  it.each([
    ["signed by another key", () => idToken({ id: 5_550_203 }, { key: otherKey })],
    ["another issuer", () => idToken({ id: 5_550_203 }, { iss: "https://evil.example" })],
    ["for another bot", () => idToken({ id: 5_550_203 }, { aud: "999999" })],
    ["expired", () => idToken({ id: 5_550_203 }, { exp: Math.floor(Date.now() / 1000) - 3600 })],
    ["no user id", () => idToken({ name: "x" })],
  ])("%s → 401, nobody created", async (_name, token) => {
    await logIn(await token()).expect(401);
    expect(await users().count()).toBe(0);
  });

  it("not a JWT → 400", async () => {
    await logIn("not-a-token").expect(400);
  });

  it("with a guest's token: their earlier purchase moves to the Telegram account", async () => {
    const guest = (await http().post("/api/auth/guest").send({}).expect(200)).body;
    const [{ id: guestId }] = await t.ds.query(
      `SELECT "id" FROM "users" WHERE "telegramId" IS NULL ORDER BY "id" DESC LIMIT 1`,
    );
    const venue = await createVenue(t.ds);
    const order = await createOrder(t.ds, { userId: guestId, venueId: venue.id });

    const res = await logIn(await idToken({ id: 5_550_204 }), guest.guestToken).expect(200);

    expect(res.body.merged).toBe(true);
    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: order.id })).userId).toBe(
      (await users().findOneByOrFail({ telegramId: 5_550_204 })).id,
    );
  });
});
