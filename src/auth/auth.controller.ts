import { Controller, Post, Body, HttpCode, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiOkResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { LogInDto } from "./dtos/log-in.dto";
import { Public } from "./public.decorator";
import { toLanguage } from "@/common/translations";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Keyed by req.ip — on Koyeb that's the proxy node, shared by everyone behind it (CLAUDE.md
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
}
