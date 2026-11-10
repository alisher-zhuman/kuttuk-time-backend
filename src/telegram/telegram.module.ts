import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { BotUpdatesService } from "./bot-updates.service";
import { BotWebhookController } from "./bot-webhook.controller";
import { AdminAlertsService } from "./admin-alerts.service";
import { TelegramBotService } from "./telegram-bot.service";
import { finikConfig } from "@/finik/finik.config";

@Module({
  // finik.redirectUrl - the Mini App link for the "open" buttons.
  imports: [ConfigModule.forFeature(finikConfig)],
  controllers: [BotWebhookController],
  providers: [TelegramBotService, BotUpdatesService, AdminAlertsService],
  exports: [TelegramBotService, AdminAlertsService],
})
export class TelegramModule {}
