import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Merchant } from "@/merchants/entities/merchant.entity";
import { RedirectController } from "./redirect.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  controllers: [RedirectController],
})
export class RedirectModule {}
