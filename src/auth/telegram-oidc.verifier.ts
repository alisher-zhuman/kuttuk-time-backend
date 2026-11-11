import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { botToken } from "@/telegram/bot-token";

// «Log In With Telegram» (https://core.telegram.org/bots/telegram-login) - Telegram's current
// website login (OpenID Connect; the old Login Widget is archived). The website gets an id_token
// (a JWT) from Telegram.Login and sends it here; it's trusted only after:
//   - the signature checks against Telegram's public keys (JWKS),
//   - iss = https://oauth.telegram.org, aud = our bot (the Client ID), not expired.
export const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";
const JWKS_URL = new URL("https://oauth.telegram.org/.well-known/jwks.json");

// The Client ID is the bot's id - TELEGRAM_LOGIN_CLIENT_ID, or the part of BOT_TOKEN before ":".
export const telegramLoginClientId = (): string | null => {
  const explicit = process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim();

  if (explicit) {
    return explicit;
  }

  const fromToken = botToken()?.split(":")[0];

  return fromToken && /^\d+$/.test(fromToken) ? fromToken : null;
};

export interface TelegramIdentity {
  telegramId: number;
  firstName: string | null;
}

@Injectable()
export class TelegramOidcVerifier {
  private readonly logger = new Logger(TelegramOidcVerifier.name);
  // Fetched once and cached by jose (refetched when Telegram rotates keys). Tests replace it.
  protected keys: JWTVerifyGetKey = createRemoteJWKSet(JWKS_URL);

  async verify(idToken: string): Promise<TelegramIdentity> {
    const clientId = telegramLoginClientId();

    if (!clientId) {
      this.logger.error("Log-in refused: no Telegram login client id (BOT_TOKEN unset)");

      throw new UnauthorizedException("Log-in is unavailable");
    }

    let claims: Record<string, unknown>;

    try {
      ({ payload: claims } = await jwtVerify(idToken, this.keys, {
        issuer: TELEGRAM_OIDC_ISSUER,
        audience: clientId,
        clockTolerance: 60,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Telegram id_token rejected: ${reason}`);

      throw new UnauthorizedException("Invalid Telegram login");
    }

    // `id` - the Telegram user id (the `profile` scope); `sub` as the fallback.
    const rawId = claims.id ?? claims.sub;
    const telegramId = typeof rawId === "string" ? Number(rawId) : rawId;

    if (typeof telegramId !== "number" || !Number.isSafeInteger(telegramId) || telegramId <= 0) {
      throw new UnauthorizedException("Invalid Telegram login");
    }

    const name =
      typeof claims.given_name === "string"
        ? claims.given_name
        : typeof claims.name === "string"
          ? claims.name
          : "";

    return { telegramId, firstName: name.trim() ? name.trim().slice(0, 64) : null };
  }
}
