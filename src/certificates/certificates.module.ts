import { Module } from "@nestjs/common";

import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { MerchantCertificatesController } from "./merchant-certificates.controller";
import { RedemptionService } from "./redemption.service";

@Module({
  controllers: [CertificatesController, MerchantCertificatesController],
  providers: [CertificatesService, RedemptionService],
})
export class CertificatesModule {}
