import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dtos/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(
    @Body() loginDto: LoginDto,
  ): Promise<{ accessToken: string; role: string }> {
    return this.authService.login(loginDto.telegramId);
  }
}
