import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MerchantsController } from "./merchants.controller";
import { AdminMerchantsController } from "./admin-merchants.controller";
import { MerchantsService } from "./merchants.service";
import { Merchant } from "./entities/merchant.entity";
import { CloudinaryModule } from "@/cloudinary/cloudinary.module";

@Module({
  imports: [TypeOrmModule.forFeature([Merchant]), CloudinaryModule],
  controllers: [MerchantsController, AdminMerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
