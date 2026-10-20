import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { VenuesController } from "./venues.controller";
import { AdminVenuesController } from "./admin-venues.controller";
import { VenuesService } from "./venues.service";
import { Venue } from "./entities/venue.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { CloudinaryModule } from "@/cloudinary/cloudinary.module";

@Module({
  imports: [TypeOrmModule.forFeature([Venue, Merchant]), CloudinaryModule],
  controllers: [VenuesController, AdminVenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
