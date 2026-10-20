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
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { FinikService } from "@/finik/finik.service";
import { finikConfig } from "@/finik/finik.config";
import { paymentReturnUrl } from "./payment-redirect-url";
import { FinikApiError, FinikNetworkError, FinikTimeoutError } from "@/finik/finik.errors";

export const ORDER_TTL_MS = 30 * 60 * 1000;

export interface CreatedOrder {
  orderId: string;
  paymentUrl: string;
  expiresAt: Date;
}

export interface OrderView {
  orderId: string;
  status: OrderStatus;
  amount: number;
  merchantId: number;
  paymentUrl: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  certificate: { code: string; validUntil: Date } | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Certificate) private readonly certificateRepo: Repository<Certificate>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly finikService: FinikService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  async create(userId: number, dto: CreateOrderDto): Promise<CreatedOrder> {
    const merchant = await this.merchantRepo.findOne({ where: { id: dto.merchantId } });

    if (!merchant || !merchant.isActive) {
      throw new BadRequestException("Merchant is not available");
    }

    // The amount always comes from the merchant's current nominals, never from the client.
    if (!merchant.nominals.includes(dto.nominal)) {
      throw new BadRequestException("Nominal is not available for this merchant");
    }

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        id: randomUUID(),
        userId,
        merchantId: merchant.id,
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
        nameEn: merchant.name,
        description: `${merchant.name} — ${order.amount} KGS`,
        lang: "ru",
        endDate: order.expiresAt.getTime(),
        redirectUrl: paymentReturnUrl(this.finik.webhookUrl, order.id),
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

        throw new BadGatewayException(
          "Payment service is temporarily unavailable, please try again later",
        );
      }

      throw error;
    }

    await this.orderRepo.update(order.id, { paymentUrl });

    this.logger.log(`Order ${order.id} created: merchant=${merchant.id} amount=${order.amount}`);

    return { orderId: order.id, paymentUrl, expiresAt: order.expiresAt };
  }

  async findOwn(userId: number, orderId: string): Promise<OrderView> {
    // Someone else's order is indistinguishable from a missing one.
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId } });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const certificate =
      order.status === OrderStatus.Paid
        ? await this.certificateRepo.findOne({ where: { orderId: order.id } })
        : null;

    return {
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      merchantId: order.merchantId,
      paymentUrl: order.status === OrderStatus.Pending ? order.paymentUrl : null,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      certificate: certificate
        ? { code: certificate.code, validUntil: certificate.validUntil }
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
