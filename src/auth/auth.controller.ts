import { Controller, Post, Body } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { LogInDto } from "./dtos/log-in.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("logIn")
  @ApiOperation({ summary: "Log in by Telegram ID, returns JWT" })
  logIn(
    @Body() logInDto: LogInDto,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.logIn(logInDto.telegramId);
  }
}
