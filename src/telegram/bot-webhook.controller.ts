import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import { BotUpdatesService, type TelegramUpdate } from "./bot-updates.service";
import { isValidWebhookSecret } from "./bot-webhook-secret";
import { Public } from "@/auth/public.decorator";

// Incoming bot updates (set by `npm run bot:setup`). Telegram proves it's Telegram with the
// secret header; anything else → 401. Valid updates get 200 at once and are handled after —
// Telegram retries a slow or non-2xx answer, which would duplicate replies.
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller("telegram")
export class BotWebhookController {
  constructor(private readonly updates: BotUpdatesService) {}

  @Post("webhook")
  @HttpCode(200)
  webhook(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): { ok: true } {
    if (!isValidWebhookSecret(secret)) {
      throw new UnauthorizedException();
    }

    void this.updates.handle(update);

    return { ok: true };
  }
}
