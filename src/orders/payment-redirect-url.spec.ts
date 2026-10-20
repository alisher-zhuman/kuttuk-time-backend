import { paymentRedirectUrl, paymentReturnUrl } from "./payment-redirect-url";

const ID = "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10";

describe("paymentRedirectUrl", () => {
  it.each([
    [
      "the Mini App link",
      "https://t.me/kuttuk_time_bot/app",
      `https://t.me/kuttuk_time_bot/app?startapp=order_${ID}`,
    ],
    [
      "a base that already has a query",
      "https://t.me/kuttuk_time_bot/app?mode=compact",
      `https://t.me/kuttuk_time_bot/app?mode=compact&startapp=order_${ID}`,
    ],
    [
      "a base that already has a startapp (replaced, not duplicated)",
      "https://t.me/kuttuk_time_bot/app?startapp=home",
      `https://t.me/kuttuk_time_bot/app?startapp=order_${ID}`,
    ],
    [
      "a base with a fragment (query goes before it)",
      "https://example.kg/app#top",
      `https://example.kg/app?startapp=order_${ID}#top`,
    ],
  ])("%s", (_name, base, expected) => {
    expect(paymentRedirectUrl(base, ID)).toBe(expected);
  });

  it("keeps the start param within Telegram's allowed charset [A-Za-z0-9_-]", () => {
    const startapp = new URL(
      paymentRedirectUrl("https://t.me/kuttuk_time_bot/app", ID),
    ).searchParams.get("startapp");

    expect(startapp).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});

describe("paymentReturnUrl", () => {
  it.each([
    [
      "the prod webhook URL",
      "https://kuttuk-time.koyeb.app/api/finik/webhook",
      "https://kuttuk-time.koyeb.app",
    ],
    ["a URL with a port", "http://localhost:3000/api/finik/webhook", "http://localhost:3000"],
    ["a URL with a query", "https://example.kg/api/finik/webhook?x=1", "https://example.kg"],
  ])("takes only the origin of %s", (_name, webhookUrl, origin) => {
    expect(paymentReturnUrl(webhookUrl, ID)).toBe(`${origin}/api/payments/return/${ID}`);
  });
});
