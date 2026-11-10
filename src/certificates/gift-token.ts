import { createHash, randomBytes } from "node:crypto";

// Must match GIFT_START_PARAM_PREFIX in ../frontend src/shared/constants/base.ts: the Mini App
// opens the "Забрать подарок" screen for startapp=gift_<token>. Can't collide with a venue slug
// (slugs have no underscore) or order_<uuid>.
export const GIFT_START_PARAM_PREFIX = "gift_";

// 16 random bytes → 22 base64url chars: unguessable, and fits Telegram's start param
// (≤ 64 chars of A-Z a-z 0-9 _ -) with the prefix.
export const generateGiftToken = (): string => randomBytes(16).toString("base64url");

export const isGiftToken = (value: string): boolean => /^[A-Za-z0-9_-]{22}$/.test(value);

// Only the hash is stored: a database read never hands out working links.
export const giftTokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
