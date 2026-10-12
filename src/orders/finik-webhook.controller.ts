import { Body, Controller, Headers, HttpCode, Post, Query } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import { FinikWebhookService } from "./finik-webhook.service";
import { Public } from "@/auth/public.decorator";

@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller("finik")
export class FinikWebhookController {
  constructor(private readonly webhookService: FinikWebhookService) {}

  // 200 = "don't retry" (processed, duplicate, or nothing to do); 401 = bad signature; 5xx = Finik retries.
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    await this.webhookService.handle({ headers, query, body });

    return { ok: true };
  }
}
