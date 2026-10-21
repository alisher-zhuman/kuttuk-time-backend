import { createHash, timingSafeEqual } from "node:crypto";

import { botToken } from "./bot-token";

// The secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token with every update (set by
// `npm run bot:setup` via setWebhook). Derived from BOT_TOKEN, so there's no extra env var, and
// rotating the token rotates it (re-run bot:setup then). Hex fits Telegram's [A-Za-z0-9_-]{1,256}.
export const botWebhookSecret = (token = botToken()): string | null =>
  token ? createHash("sha256").update(`kuttuk-time:bot-webhook:${token}`).digest("hex") : null;

export const isValidWebhookSecret = (header: string | undefined): boolean => {
  const expected = botWebhookSecret();

  if (!expected || typeof header !== "string") {
    return false;
  }

  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};
