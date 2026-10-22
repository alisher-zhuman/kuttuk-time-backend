import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { MerchantCabinetController } from "./merchant-cabinet.controller";
import { MerchantCabinetService } from "./merchant-cabinet.service";
import { MerchantCertificatesController } from "./merchant-certificates.controller";
import { QrController } from "./qr.controller";
import { RedemptionService } from "./redemption.service";
import { RedemptionNotifier } from "./redemption-notifier";
import { ExpiryRemindersService } from "./expiry-reminders.service";
import { GiftShareService } from "./gift-share.service";
import { finikConfig } from "@/finik/finik.config";
import { TelegramModule } from "@/telegram/telegram.module";

@Module({
  // finik.redirectUrl — the Mini App link for the reminder button.
  imports: [TelegramModule, ConfigModule.forFeature(finikConfig)],
  controllers: [
    CertificatesController,
    MerchantCertificatesController,
    MerchantCabinetController,
    QrController,
  ],
  providers: [
    CertificatesService,
    RedemptionService,
    RedemptionNotifier,
    MerchantCabinetService,
    ExpiryRemindersService,
    GiftShareService,
  ],
})
export class CertificatesModule {}
