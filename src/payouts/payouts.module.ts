import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AdminPayoutsController } from "./admin-payouts.controller";
import { AdminPayoutsService } from "./admin-payouts.service";
import { finikConfig } from "@/finik/finik.config";
import { TelegramModule } from "@/telegram/telegram.module";

@Module({
  // finik.redirectUrl — the Mini App link for the bot message button.
  imports: [TelegramModule, ConfigModule.forFeature(finikConfig)],
  controllers: [AdminPayoutsController],
  providers: [AdminPayoutsService],
})
export class PayoutsModule {}
