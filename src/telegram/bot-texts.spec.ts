import { botLanguage } from "./bot-texts";
import { botWebhookSecret } from "./bot-webhook-secret";

describe("botLanguage", () => {
  it.each([
    ["ky", "kg"],
    ["ru", "ru"],
    ["en-US", "en"],
    ["uz", "ru"],
    [undefined, "ru"],
  ])("%p → %p", (code, expected) => {
    expect(botLanguage(code)).toBe(expected);
  });
});

describe("botWebhookSecret", () => {
  it("is derived from the token: stable, different per token, Telegram-safe", () => {
    const a = botWebhookSecret("123:a");

    expect(a).toBe(botWebhookSecret("123:a"));
    expect(a).not.toBe(botWebhookSecret("123:b"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
    expect(a).not.toContain("123:a");
    expect(botWebhookSecret(null)).toBeNull();
  });
});
