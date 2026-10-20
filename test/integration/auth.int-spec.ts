import { JwtService } from "@nestjs/jwt";
import * as request from "supertest";

import { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createUser } from "../helpers/factories";
import { initDataFields, nowSec, signInitData, telegramUser } from "../helpers/init-data";

const BOT_TOKEN = () => process.env.BOT_TOKEN ?? "";
const DAY = 24 * 60 * 60;

describe("POST /api/auth/log-in — Telegram initData (integration)", () => {
  let t: TestApp;

  const logIn = (initData: string) =>
    request(t.app.getHttpServer()).post("/api/auth/log-in").send({ initData });
  const signed = (telegramId: number, overrides: Record<string, string> = {}) =>
    signInitData(initDataFields(telegramId, overrides), BOT_TOKEN());
  const payload = (token: string) =>
    t.app.get(JwtService).verify<{ userId: number; role: string; telegramId: number }>(token);
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

  describe("valid initData", () => {
    it("200: creates the user and returns a JWT with { userId, role, telegramId }", async () => {
      const res = await logIn(signed(7_123_456_789)).expect(200);

      expect(res.body).toEqual({ accessToken: expect.any(String), role: "user" });

      const user = await users().findOneByOrFail({ telegramId: 7_123_456_789 });

      expect(payload(res.body.accessToken)).toMatchObject({
        userId: user.id,
        role: "user",
        telegramId: 7_123_456_789,
      });
    });

    it("a repeat log-in reuses the user (no duplicates)", async () => {
      await logIn(signed(42)).expect(200);
      await logIn(signed(42)).expect(200);

      expect(await users().countBy({ telegramId: 42 })).toBe(1);
    });

    it("accepts initData with only the required fields (no query_id/chat_*/start_param/signature)", async () => {
      const fields = { user: telegramUser(42), auth_date: String(nowSec()) };

      await logIn(signInitData(fields, BOT_TOKEN())).expect(200);
    });

    it("unicode, escaped slashes, '+', '&', '=' in values survive URL decoding", async () => {
      const user = telegramUser(42, {
        first_name: "Алишер 😀 A+B & C=D",
        photo_url: "https:\\/\\/t.me\\/i\\/userpic\\/320\\/abc.svg",
      });

      await logIn(signed(42, { user })).expect(200);
    });
  });

  describe("the `signature` field (the bug that bit us once)", () => {
    it("is part of the data-check-string: a hash computed WITHOUT it is rejected", async () => {
      const fields = initDataFields(42);
      const wrong = signInitData(fields, BOT_TOKEN(), { exclude: ["signature"] });

      await logIn(wrong).expect(401);
    });
  });

  describe("tampering → 401", () => {
    it.each([
      ["user id changed after signing", (s: string) => s.replace("%22id%22%3A42", "%22id%22%3A43")],
      [
        "auth_date changed after signing",
        (s: string) => s.replace(/auth_date=\d+/, `auth_date=${nowSec() - 5}`),
      ],
      ["start_param changed after signing", (s: string) => s.replace("order_", "evil_")],
      ["a field added after signing", (s: string) => `${s}&extra=1`],
      ["hash removed", (s: string) => s.replace(/&?hash=[0-9a-f]+/, "")],
      ["hash not hex", (s: string) => s.replace(/hash=[0-9a-f]+/, "hash=zzzz")],
      ["hash truncated", (s: string) => s.replace(/(hash=[0-9a-f]{10})[0-9a-f]+/, "$1")],
    ])("%s", async (_name, mutate) => {
      await logIn(mutate(signed(42))).expect(401);
      expect(await users().count()).toBe(0);
    });

    it("signed with another bot's token", async () => {
      await logIn(signInitData(initDataFields(42), "999999:another-bot")).expect(401);
    });

    it("not initData at all", async () => {
      await logIn("hello").expect(401);
      await logIn("").expect(401);
    });

    it("no initData in the body → 400", async () => {
      await request(t.app.getHttpServer()).post("/api/auth/log-in").send({}).expect(400);
    });
  });

  describe("auth_date window: up to 24h old, up to 60s in the future", () => {
    it.each([
      ["23h59m old → 200", nowSec() - DAY + 60, 200],
      ["24h1m old → 401", nowSec() - DAY - 60, 401],
      ["30s in the future (clock drift) → 200", nowSec() + 30, 200],
      ["2 min in the future → 401", nowSec() + 120, 401],
    ])("%s", async (_name, authDate, status) => {
      await logIn(signed(42, { auth_date: String(authDate) })).expect(status);
    });

    it.each([["missing"], ["not a number"], ["fractional"]])("auth_date %s → 401", async (kind) => {
      const fields = initDataFields(42);

      if (kind === "missing") {
        delete (fields as Record<string, string | undefined>).auth_date;
      } else {
        fields.auth_date = kind === "not a number" ? "yesterday" : `${nowSec()}.5`;
      }

      await logIn(signInitData(fields, BOT_TOKEN())).expect(401);
    });
  });

  describe("the user field", () => {
    it.each([
      ["missing", null],
      ["not JSON", "{oops"],
      ["no id", JSON.stringify({ first_name: "X" })],
      ["string id", JSON.stringify({ id: "42" })],
      ["negative id", JSON.stringify({ id: -42 })],
      ["zero id", JSON.stringify({ id: 0 })],
      ["fractional id", JSON.stringify({ id: 4.2 })],
      ["id beyond 2^53", '{"id":9007199254740993}'],
    ])("%s → 401 (even when correctly signed)", async (_name, user) => {
      const fields = initDataFields(42);

      if (user === null) {
        delete (fields as Record<string, string | undefined>).user;
      } else {
        fields.user = user;
      }

      await logIn(signInitData(fields, BOT_TOKEN())).expect(401);
      expect(await users().count()).toBe(0);
    });

    it("a Telegram id above int32 (bigint column) works", async () => {
      await logIn(signed(8_000_000_123)).expect(200);
      expect(await users().countBy({ telegramId: 8_000_000_123 })).toBe(1);
    });
  });

  describe("roles", () => {
    it("first log-in of an active merchant's owner → merchant", async () => {
      await createMerchant(t.ds, { merchantTelegramId: 555 });

      const res = await logIn(signed(555)).expect(200);

      expect(res.body.role).toBe("merchant");
      expect(payload(res.body.accessToken).role).toBe("merchant");
    });

    it("an existing user becomes merchant once their merchant exists and is active", async () => {
      await createUser(t.ds, { telegramId: 555, role: "user" });
      await createMerchant(t.ds, { merchantTelegramId: 555 });

      expect((await logIn(signed(555)).expect(200)).body.role).toBe("merchant");
      expect((await users().findOneByOrFail({ telegramId: 555 })).role).toBe("merchant");
    });

    it("an inactive merchant's owner logging in for the first time → user", async () => {
      await createMerchant(t.ds, { merchantTelegramId: 555, isActive: false });

      expect((await logIn(signed(555)).expect(200)).body.role).toBe("user");
    });

    it("admin stays admin, even if they also own a merchant", async () => {
      await createUser(t.ds, { telegramId: 1, role: "admin" });
      await createMerchant(t.ds, { merchantTelegramId: 1 });

      expect((await logIn(signed(1)).expect(200)).body.role).toBe("admin");
    });

    it("current behaviour: a merchant whose merchant got deactivated keeps the merchant role", async () => {
      await createUser(t.ds, { telegramId: 555, role: "merchant" });
      await createMerchant(t.ds, { merchantTelegramId: 555, isActive: false });

      // Deliberate: a deactivated merchant still sees its cabinet and redeems what it sold.
      expect((await logIn(signed(555)).expect(200)).body.role).toBe("merchant");
    });
  });

  describe("BOT_TOKEN missing", () => {
    const saved = process.env.BOT_TOKEN;

    afterEach(() => {
      process.env.BOT_TOKEN = saved;
    });

    // HMAC("WebAppData", "") is public knowledge — without this, anyone could forge initData
    // for any telegramId, an admin included.
    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["not set at all", undefined],
    ])(
      "%s: fails closed — initData signed with an empty token is rejected",
      async (_name, value) => {
        if (value === undefined) {
          delete process.env.BOT_TOKEN;
        } else {
          process.env.BOT_TOKEN = value;
        }

        const res = await logIn(signInitData(initDataFields(42), (value ?? "").trim())).expect(401);

        expect(res.body.message).toBe("Log-in is unavailable");
        expect(await users().count()).toBe(0);
      },
    );

    it("the rest of the app keeps working (public routes answer)", async () => {
      delete process.env.BOT_TOKEN;

      await request(t.app.getHttpServer()).get("/api/merchants/options").expect(200);
    });

    it("an admin can't be impersonated with an empty token either", async () => {
      await createUser(t.ds, { telegramId: 1, role: "admin" });
      process.env.BOT_TOKEN = "";

      await logIn(signInitData(initDataFields(1), "")).expect(401);
    });
  });
});
