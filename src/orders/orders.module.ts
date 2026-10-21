import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Order } from "./entities/order.entity";
import { OrderResolution } from "./entities/order-resolution.entity";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { FinikWebhookController } from "./finik-webhook.controller";
import { FinikWebhookService } from "./finik-webhook.service";
import { PaymentReturnController } from "./payment-return.controller";
import { SaleNotifier } from "./sale-notifier";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminOrdersService } from "./admin-orders.service";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Venue } from "@/venues/entities/venue.entity";
import { FinikModule } from "@/finik/finik.module";
import { finikConfig } from "@/finik/finik.config";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";
import { TelegramModule } from "@/telegram/telegram.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderResolution, Certificate, Venue, FinikWebhookEvent]),
    FinikModule,
    TelegramModule,
    // finik.webhookUrl (public origin) and finik.redirectUrl (Mini App base) for the payment return.
    ConfigModule.forFeature(finikConfig),
  ],
  controllers: [
    OrdersController,
    FinikWebhookController,
    PaymentReturnController,
    AdminOrdersController,
  ],
  providers: [OrdersService, FinikWebhookService, SaleNotifier, AdminOrdersService],
})
export class OrdersModule {}
