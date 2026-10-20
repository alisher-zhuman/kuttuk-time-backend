import { createHmac } from "node:crypto";

// An independent implementation of Telegram's Mini App initData signing
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
// data-check-string = all fields except `hash`, "key=value", sorted by key, joined with "\n";
// secret = HMAC_SHA256(key "WebAppData", BOT_TOKEN); hash = hex HMAC_SHA256(secret, dcs).
// Sorted by UTF-16 code units (plain .sort()), deliberately not like the code under test.
export const signInitData = (
  fields: Record<string, string>,
  botToken: string,
  opts: { exclude?: string[] } = {},
): string => {
  const dataCheckString = Object.keys(fields)
    .filter((key) => !(opts.exclude ?? []).includes(key))
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  return new URLSearchParams({ ...fields, hash }).toString();
};

export const telegramUser = (id: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    id,
    first_name: "Test",
    last_name: "User",
    username: "test_user",
    language_code: "ru",
    allows_write_to_pm: true,
    ...extra,
  });

export const nowSec = () => Math.floor(Date.now() / 1000);

// A realistic field set, like a real Mini App launch from a deep link.
export const initDataFields = (
  telegramId: number,
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
  user: telegramUser(telegramId),
  auth_date: String(nowSec()),
  chat_instance: "-3788475317572404878",
  chat_type: "sender",
  start_param: "order_5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
  // Ed25519 signature for third-party validation — part of the HMAC data-check-string.
  signature: "6fbdaab833d39f54518bd5c3eb3f511d035e68cb2LiJ_8mRSxvB2GQ4sX5bYNdaWk6xjBmqz0Rwv-Q",
  ...overrides,
});
