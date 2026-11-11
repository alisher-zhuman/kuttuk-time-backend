import { Controller, Post, Body, HttpCode, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiOkResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { GuestLogInDto } from "./dtos/guest-log-in.dto";
import { LogInDto } from "./dtos/log-in.dto";
import { OidcLogInDto } from "./dtos/oidc-log-in.dto";
import { Public } from "./public.decorator";
import { toLanguage } from "@/common/translations";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Keyed by req.ip - on Koyeb that's the proxy node, shared by everyone behind it (CLAUDE.md
  // TODOs). The default 60/min could block real users during a rush; initData's HMAC already
  // makes guessing pointless, so a high ceiling only stops floods.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post("log-in")
  @HttpCode(200)
  @ApiOperation({
    summary: "Log in via Telegram Mini App",
    description:
      "Send Telegram `initData`. The server verifies the signature and returns a JWT.\n\n" +
      "**Roles:** all",
  })
  @ApiOkResponse({
    description: "JWT token and user role",
    schema: {
      example: { accessToken: "eyJhbGci...", role: "user" },
    },
  })
  @ApiUnauthorizedResponse({
    description: "Invalid or tampered initData",
    schema: {
      example: { statusCode: 401, message: "Invalid initData signature", error: "Unauthorized" },
    },
  })
  logIn(
    @Body() logInDto: LogInDto,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.logIn(logInDto.initData, toLanguage(acceptLanguage));
  }

  @Public()
  // Each call without a token adds a users row - by IP, low enough to stop a flood; a real
  // browser makes one such call and then reuses its token.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("guest")
  @HttpCode(200)
  @ApiOperation({
    summary: "Log in as a website guest (no Telegram, no sign-up)",
    description:
      "For the website outside Telegram (docs/web-version.md). Send the `guestToken` you were given before (keep it in the browser): a known one → the same guest; none / unknown → a new guest. Returns a JWT (role `user`, no Telegram - the bot doesn't write to a guest) and the `guestToken` to keep. Rate limit 20/min by IP.",
  })
  @ApiOkResponse({
    schema: { example: { accessToken: "eyJhbGci...", role: "user", guestToken: "Zm9vYmFy…" } },
  })
  guestLogIn(
    @Body() dto: GuestLogInDto,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<{ accessToken: string; role: string; guestToken: string }> {
    return this.authService.guestLogIn(dto.guestToken, toLanguage(acceptLanguage));
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("telegram-oidc")
  @HttpCode(200)
  @ApiOperation({
    summary: "«Войти через Telegram» on the website - Log In With Telegram (OIDC)",
    description:
      "Telegram's current website login (https://core.telegram.org/bots/telegram-login). Send the `id_token` from Telegram.Login and the website guest's `guestToken` if any. The token is checked against Telegram's keys (JWKS), `iss` = https://oauth.telegram.org, `aud` = our bot id (Client ID), not expired; invalid → 401. The same account as in the Mini App; the guest's purchases move to it (`merged: true`). 60/min by IP.",
  })
  @ApiOkResponse({
    schema: { example: { accessToken: "eyJhbGci...", role: "user", merged: false } },
  })
  @ApiUnauthorizedResponse({ description: "Invalid or expired id_token" })
  oidcLogIn(
    @Body() dto: OidcLogInDto,
    @Headers("accept-language") acceptLanguage?: string,
  ): Promise<{ accessToken: string; role: string; merged: boolean }> {
    return this.authService.oidcLogIn(dto.idToken, dto.guestToken, toLanguage(acceptLanguage));
  }
}
