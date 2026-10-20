import { Module } from "@nestjs/common";

import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { MerchantCabinetController } from "./merchant-cabinet.controller";
import { MerchantCabinetService } from "./merchant-cabinet.service";
import { MerchantCertificatesController } from "./merchant-certificates.controller";
import { RedemptionService } from "./redemption.service";

@Module({
  controllers: [CertificatesController, MerchantCertificatesController, MerchantCabinetController],
  providers: [CertificatesService, RedemptionService, MerchantCabinetService],
})
export class CertificatesModule {}
