import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { finikConfig } from "./finik.config";
import { FinikService } from "./finik.service";
import { FinikWebhookVerifier } from "./finik-webhook.verifier";

@Module({
  imports: [ConfigModule.forFeature(finikConfig)],
  providers: [FinikService, FinikWebhookVerifier],
  exports: [FinikService, FinikWebhookVerifier],
})
export class FinikModule {}
