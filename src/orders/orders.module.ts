import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./entities/order.entity";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { FinikModule } from "@/finik/finik.module";

@Module({
  imports: [TypeOrmModule.forFeature([Order, Certificate, Merchant]), FinikModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
