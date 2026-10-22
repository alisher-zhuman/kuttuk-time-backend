import request from "supertest";

import { botWebhookSecret } from "../../src/telegram/bot-webhook-secret";
import { createTestApp, waitFor, type TestApp } from "../helpers/app";
import { createMerchant, createVenue } from "../helpers/factories";

const CHAT = 555_000_111;
const APP = "https://t.me/kuttuk_time_bot/app";

describe("POST /api/telegram/webhook (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());
  const update = (
    text: string,
    opts: { lang?: string; chatType?: string; isBot?: boolean } = {},
  ) => ({
    update_id: 1,
    message: {
      text,
      chat: { id: CHAT, type: opts.chatType ?? "private" },
      from: { id: CHAT, is_bot: opts.isBot ?? false, language_code: opts.lang ?? "ru" },
    },
  });
  const post = (body: unknown, secret: string | null = botWebhookSecret()) => {
    const req = http().post("/api/telegram/webhook");

    return (secret === null ? req : req.set("X-Telegram-Bot-Api-Secret-Token", secret)).send(
      body as object,
    );
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    process.env.MINI_APP_URL = "https://kuttuk-time.vercel.app";
  });

  afterAll(async () => {
    delete process.env.MINI_APP_URL;
    await t?.close();
  });

  it("401 without / with a wrong secret, nothing sent", async () => {
    await post(update("/start"), null).expect(401);
    await post(update("/start"), "wrong").expect(401);
    await settle();

    expect(t.bot.sent).toHaveLength(0);
  });

  it("/start → a welcome in the user's language, an open button, the menu button in that language", async () => {
    await post(update("/start", { lang: "ru" })).expect(200, { ok: true });
    await waitFor(() => t.bot.calls.length === 1);

    expect(t.bot.sent).toEqual([
      {
        chatId: CHAT,
        html: expect.stringContaining("Добро пожаловать в <b>KuttukTime</b>"),
        button: { text: "Открыть KuttukTime", url: APP },
      },
    ]);
    expect(t.bot.calls[0]).toEqual({
      method: "setChatMenuButton",
      payload: {
        chat_id: CHAT,
        menu_button: {
          type: "web_app",
          text: "Открыть",
          web_app: { url: "https://kuttuk-time.vercel.app" },
        },
      },
    });
  });

  it.each([
    ["ky", "<b>KuttukTime</b>'га кош келиңиз", "KuttukTime ачуу", "Ачуу"],
    ["en", "Welcome to <b>KuttukTime</b>", "Open KuttukTime", "Open"],
    ["de", "Добро пожаловать", "Открыть KuttukTime", "Открыть"],
  ])("language %s", async (lang, welcome, button, menu) => {
    await post(update("/start", { lang })).expect(200);
    await waitFor(() => t.bot.calls.length === 1);

    expect(t.bot.sent[0].html).toContain(welcome);
    expect(t.bot.sent[0].button?.text).toBe(button);
    expect((t.bot.calls[0].payload.menu_button as { text: string }).text).toBe(menu);
  });

  it("/start <slug> of a visible venue → the button opens that venue", async () => {
    const venue = await createVenue(t.ds, { name: "Coffeeroom", slug: "coffeeroom" });

    await post(update("/start coffeeroom")).expect(200);
    await waitFor(() => t.bot.sent.length === 1);

    expect(t.bot.sent[0].button).toEqual({
      text: "Открыть Coffeeroom",
      url: `${APP}?startapp=${venue.slug}`,
    });
  });

  it("/start <slug> of a hidden / unknown venue, or not a slug → the plain app button", async () => {
    const off = await createMerchant(t.ds, { isActive: false });

    await createVenue(t.ds, { slug: "hidden", merchantId: off.id });

    for (const text of ["/start hidden", "/start nope", "/start order_5e1c1f5b", "/start ../x"]) {
      t.bot.reset();
      await post(update(text)).expect(200);
      await waitFor(() => t.bot.sent.length === 1);

      expect(t.bot.sent[0].button).toEqual({ text: "Открыть KuttukTime", url: APP });
    }
  });

  it("any other message → 'everything is in the app' + support, the open button", async () => {
    await post(update("привет")).expect(200);
    await waitFor(() => t.bot.sent.length === 1);

    expect(t.bot.sent[0]).toEqual({
      chatId: CHAT,
      html: "Всё делается в приложении 👇\n\nВопросы — @alisher_zh",
      button: { text: "Открыть KuttukTime", url: APP },
    });
    expect(t.bot.calls).toHaveLength(0);
  });

  it("ignores groups, other bots, and updates without a message", async () => {
    await post(update("/start", { chatType: "group" })).expect(200);
    await post(update("/start", { isBot: true })).expect(200);
    await post({ update_id: 2, edited_message: { text: "x" } }).expect(200);
    await settle();

    expect(t.bot.sent).toHaveLength(0);
  });

  it("without MINI_APP_URL the welcome still goes, the per-chat menu button is skipped", async () => {
    delete process.env.MINI_APP_URL;

    await post(update("/start")).expect(200);
    await waitFor(() => t.bot.sent.length === 1);
    await settle();

    expect(t.bot.calls).toHaveLength(0);
  });
});
