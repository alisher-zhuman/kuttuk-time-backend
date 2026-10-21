import { Logger } from "@nestjs/common";

import { escapeHtml, TelegramBotService } from "./telegram-bot.service";

const TOKEN = "123456:secret-token";

describe("TelegramBotService", () => {
  const bot = new TelegramBotService();
  let fetchMock: jest.SpyInstance;
  let logs: string[];

  beforeEach(() => {
    process.env.BOT_TOKEN = TOKEN;
    fetchMock = jest.spyOn(global, "fetch");
    logs = [];
    for (const level of ["log", "warn", "error"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((message: unknown) => {
        logs.push(`${level}: ${String(message)}`);
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BOT_TOKEN;
  });

  it("POSTs sendMessage: HTML, no link preview, an inline URL button", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      bot.send({ chatId: 42, html: "<b>hi</b>", button: { text: "Open", url: "https://t.me/x" } }),
    ).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      chat_id: 42,
      text: "<b>hi</b>",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://t.me/x" }]] },
    });
  });

  it("extra buttons: one per row, a copy button as copy_text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await bot.send({
      chatId: 42,
      html: "x",
      button: { text: "Open", url: "https://t.me/x" },
      buttons: [{ text: "Copy code", copyText: "04718263" }],
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "Open", url: "https://t.me/x" }],
        [{ text: "Copy code", copy_text: { text: "04718263" } }],
      ],
    });
  });

  it("request() returns the method's result; null on an API error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { id: "p1", expiration_date: 1 } }), {
        status: 200,
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));

    await expect(bot.request("savePreparedInlineMessage", {})).resolves.toEqual({
      id: "p1",
      expiration_date: 1,
    });
    await expect(bot.request("savePreparedInlineMessage", {})).resolves.toBeNull();
  });

  it("403 (never started the bot) → false, a warning, no throw", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, description: "Forbidden: bot can't initiate conversation" }),
        { status: 403 },
      ),
    );

    await expect(bot.send({ chatId: 42, html: "x" })).resolves.toBe(false);
    expect(logs).toEqual([
      "warn: Bot message to 42 not sent: 403 Forbidden: bot can't initiate conversation",
    ]);
  });

  it("other API errors → false, an error log", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));

    await expect(bot.send({ chatId: 42, html: "x" })).resolves.toBe(false);
    expect(logs[0]).toMatch(/^error: Bot message to 42 not sent: 500/);
  });

  it("a network error / timeout → false, and the log never contains the token", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: `connect ECONNREFUSED bot${TOKEN}` }),
    );

    await expect(bot.send({ chatId: 42, html: "x" })).resolves.toBe(false);
    expect(logs).toEqual(["error: Bot message to 42 failed: TypeError: fetch failed"]);
    expect(logs.join()).not.toContain(TOKEN);
  });

  it("no BOT_TOKEN → skipped without calling Telegram", async () => {
    delete process.env.BOT_TOKEN;

    await expect(bot.send({ chatId: 42, html: "x" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("escapeHtml escapes &, <, >", () => {
    expect(escapeHtml(`Tom & <Jerry>`)).toBe("Tom &amp; &lt;Jerry&gt;");
  });
});
