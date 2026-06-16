import { Controller, Post, Body } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { LoginDto } from "./dtos/login.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Login by Telegram ID, returns JWT" })
  login(
    @Body() loginDto: LoginDto,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.login(loginDto.telegramId);
  }
}
