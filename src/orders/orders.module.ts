import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./entities/order.entity";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { FinikWebhookController } from "./finik-webhook.controller";
import { FinikWebhookService } from "./finik-webhook.service";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { FinikModule } from "@/finik/finik.module";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Certificate, Merchant, FinikWebhookEvent]),
    FinikModule,
  ],
  controllers: [OrdersController, FinikWebhookController],
  providers: [OrdersService, FinikWebhookService],
})
export class OrdersModule {}
