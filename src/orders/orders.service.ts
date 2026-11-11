import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { LessThan, Repository } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { orderNumber } from "./order-number";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { effectiveStatusSql, usedAtField } from "@/certificates/effective-status";
import type { EffectiveCertificateStatus } from "@/certificates/effective-status";
import { Venue } from "@/venues/entities/venue.entity";
import { User } from "@/users/entities/user.entity";
import type { Language } from "@/common/translations";
import { FinikService } from "@/finik/finik.service";
import { finikConfig } from "@/finik/finik.config";
import { paymentReturnUrl } from "./payment-redirect-url";
import { FinikApiError, FinikNetworkError, FinikTimeoutError } from "@/finik/finik.errors";
import { AdminAlertsService } from "@/telegram/admin-alerts.service";

export const ORDER_TTL_MS = 30 * 60 * 1000;

export interface CreatedOrder {
  orderId: string;
  paymentUrl: string;
  expiresAt: Date;
}

export interface OrderView {
  orderId: string;
  // «Заказ №A1B2C3D4» - what the buyer quotes to support.
  number: string;
  status: OrderStatus;
  amount: number;
  venueId: number;
  paymentUrl: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  // id - for "Подарить" (POST /certificates/:id/share) straight from the order screen; status -
  // the effective one, so a used / expired certificate isn't shown as valid (usedAt only for used).
  certificate: {
    id: string;
    code: string;
    validUntil: Date;
    status: EffectiveCertificateStatus;
    usedAt?: Date;
    // The buyer gave it away and the friend claimed it - shown as «Подарен», no «Подарить».
    giftedAt?: Date;
  } | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Certificate) private readonly certificateRepo: Repository<Certificate>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    private readonly finikService: FinikService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
    private readonly alerts: AdminAlertsService,
  ) {}

  // language: the app's language at purchase - the bot sends the certificate code in it.
  async create(
    userId: number,
    dto: CreateOrderDto,
    language: Language | null = null,
  ): Promise<CreatedOrder> {
    const venue = await this.venueRepo.findOne({
      where: { id: dto.venueId },
      relations: { merchant: true },
    });

    // Same visibility as the storefront: the venue and its merchant both active.
    if (!venue || !venue.isActive || !venue.merchant?.isActive) {
      throw new BadRequestException("Venue is not available");
    }

    // The amount always comes from the venue's current nominals, never from the client.
    if (!venue.nominals.includes(dto.nominal)) {
      throw new BadRequestException("Nominal is not available for this venue");
    }

    if (language) {
      await this.orderRepo.manager.update(User, userId, { language });
    }

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        id: randomUUID(),
        userId,
        venueId: venue.id,
        // Owner snapshot for payouts (see Order.merchantId).
        merchantId: venue.merchantId,
        amount: dto.nominal,
        status: OrderStatus.Pending,
        expiresAt: new Date(Date.now() + ORDER_TTL_MS),
      }),
    );

    let paymentUrl: string;

    try {
      ({ paymentUrl } = await this.finikService.createPayment({
        paymentId: order.id,
        amount: order.amount,
        nameEn: venue.name,
        description: `${venue.name} - ${order.amount} KGS`,
        // Finik's payment page in the app's language (kg is "ky" there); unknown → ru.
        lang: language === "kg" ? "ky" : language === "en" ? "en" : "ru",
        endDate: order.expiresAt.getTime(),
        redirectUrl: paymentReturnUrl(this.finik.webhookUrl, order.id, dto.channel === "web"),
      }));
    } catch (error) {
      // Kept (not deleted): on a timeout Finik may still have created the payment,
      // and a later webhook for this PaymentId must find its order.
      await this.orderRepo.update(
        { id: order.id, status: OrderStatus.Pending },
        { status: OrderStatus.Expired },
      );

      if (
        error instanceof FinikApiError ||
        error instanceof FinikNetworkError ||
        error instanceof FinikTimeoutError
      ) {
        this.logger.warn(`Order ${order.id} expired: payment creation failed (${error.name})`);
        // Nobody can buy while this lasts - one message an hour.
        void this.alerts.alert({
          kind: "finik_create_failed",
          throttle: true,
          html: `🚨 <b>Финик не создал платёж</b> (${error.name}) - покупатель видит «сервис оплаты недоступен».\nЗаказ <code>${order.id}</code>\n\nЕсли повторяется - проверить Финик и ключи.`,
        });

        throw new BadGatewayException(
          "Payment service is temporarily unavailable, please try again later",
        );
      }

      throw error;
    }

    await this.orderRepo.update(order.id, { paymentUrl });

    this.logger.log(`Order ${order.id} created: venue=${venue.id} amount=${order.amount}`);

    return { orderId: order.id, paymentUrl, expiresAt: order.expiresAt };
  }

  async findOwn(userId: number, orderId: string): Promise<OrderView> {
    // Someone else's order is indistinguishable from a missing one.
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId } });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    // The every-minute cron doesn't run while Koyeb sleeps: a pending order past expiresAt is
    // expired now, so the buyer doesn't get a payment link that Finik no longer honours. The same
    // guarded UPDATE as the cron - a webhook that already settled it isn't overwritten.
    if (order.status === OrderStatus.Pending && order.expiresAt.getTime() <= Date.now()) {
      const { affected } = await this.orderRepo.update(
        { id: order.id, status: OrderStatus.Pending, expiresAt: LessThan(new Date()) },
        { status: OrderStatus.Expired },
      );

      if (affected) {
        order.status = OrderStatus.Expired;
      } else {
        Object.assign(order, await this.orderRepo.findOneByOrFail({ id: order.id }));
      }
    }

    const [certificate]: Array<{
      id: string;
      code: string;
      validUntil: Date;
      status: EffectiveCertificateStatus;
      usedAt: Date | null;
      giftedAt: Date | null;
    }> =
      order.status === OrderStatus.Paid
        ? await this.certificateRepo.query(
            `SELECT c."id", c."code", c."validUntil", c."usedAt", ${effectiveStatusSql("c")} AS "status",
                    CASE WHEN c."ownerUserId" = $2 THEN NULL ELSE (
                      SELECT max(g."claimedAt") FROM "certificate_gifts" g
                       WHERE g."certificateId" = c."id" AND g."fromUserId" = $2
                    ) END AS "giftedAt"
               FROM "certificates" c WHERE c."orderId" = $1`,
            [order.id, userId],
          )
        : [];

    return {
      orderId: order.id,
      number: orderNumber(order.id),
      status: order.status,
      amount: order.amount,
      venueId: order.venueId,
      paymentUrl: order.status === OrderStatus.Pending ? order.paymentUrl : null,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      certificate: certificate
        ? {
            id: certificate.id,
            code: certificate.code,
            validUntil: certificate.validUntil,
            status: certificate.status,
            ...usedAtField(certificate.status, certificate.usedAt),
            ...(certificate.giftedAt ? { giftedAt: certificate.giftedAt } : {}),
          }
        : null,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStale(): Promise<number> {
    const { affected } = await this.orderRepo.update(
      { status: OrderStatus.Pending, expiresAt: LessThan(new Date()) },
      { status: OrderStatus.Expired },
    );

    if (affected) {
      this.logger.log(`Expired ${affected} pending order(s)`);
    }

    return affected ?? 0;
  }
}
