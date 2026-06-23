import { Controller, Post, Body } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { LogInDto } from "./dtos/log-in.dto";
import { Public } from "./public.decorator";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("log-in")
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
  @ApiUnauthorizedResponse({ description: "Invalid or tampered initData" })
  logIn(
    @Body() logInDto: LogInDto,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.logIn(logInDto.initData);
  }
}
