import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./entities/order.entity";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { FinikWebhookController } from "./finik-webhook.controller";
import { FinikWebhookService } from "./finik-webhook.service";
import { PaymentReturnController } from "./payment-return.controller";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { FinikModule } from "@/finik/finik.module";
import { finikConfig } from "@/finik/finik.config";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Certificate, Merchant, FinikWebhookEvent]),
    FinikModule,
    // finik.webhookUrl (public origin) and finik.redirectUrl (Mini App base) for the payment return.
    ConfigModule.forFeature(finikConfig),
  ],
  controllers: [OrdersController, FinikWebhookController, PaymentReturnController],
  providers: [OrdersService, FinikWebhookService],
})
export class OrdersModule {}
