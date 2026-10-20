import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MerchantsController } from "./merchants.controller";
import { AdminMerchantsController } from "./admin-merchants.controller";
import { MerchantsService } from "./merchants.service";
import { Merchant } from "./entities/merchant.entity";
import { VenuesModule } from "@/venues/venues.module";

@Module({
  imports: [TypeOrmModule.forFeature([Merchant]), VenuesModule],
  controllers: [MerchantsController, AdminMerchantsController],
  providers: [MerchantsService],
})
export class MerchantsModule {}
