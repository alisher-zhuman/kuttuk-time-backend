import { Controller, Post, Body } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { LogInDto } from "./dtos/log-in.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("log-in")
  @ApiOperation({
    summary: "Log in via Telegram Mini App",
    description:
      "Pass the raw `initData` string from `window.Telegram.WebApp.initData`. " +
      "The server verifies the Telegram signature and returns a JWT token.\n\n" +
      "**Roles:** public (no token required)",
  })
  @ApiOkResponse({
    description: "JWT token and user role",
    schema: {
      example: { accessToken: "eyJhbGci...", role: "user" },
    },
  })
  @ApiUnauthorizedResponse({ description: "Invalid or tampered initData" })
  logIn(
    @Body() logInDto: LogInDto,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.logIn(logInDto.initData);
  }
}
