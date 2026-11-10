import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { orderNumberLine } from "./order-number";
import { buyerMessage, ownerMessage, refundedMessage, reviewMessage } from "./sale-messages";
import { paymentRedirectUrl } from "./payment-redirect-url";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { AdminAlertsService } from "@/telegram/admin-alerts.service";
import { SUPPORT_URL } from "@/telegram/links";
import { escapeHtml, TelegramBotService } from "@/telegram/telegram-bot.service";

interface Sale {
  orderId: string;
  amount: number;
  venue: string;
  code: string;
  validUntil: Date;
  buyerTelegramId: string;
  buyerLanguage: Language | null;
  ownerTelegramId: string;
  ownerLanguage: Language | null;
}

// After a payment is committed: the code to the buyer, "new sale" to the venue's owner (the
// sale-time owner, orders.merchantId). Best-effort - a lost message is acceptable, a delayed or
// failed webhook answer is not, so the caller doesn't wait for it and nothing here throws.
@Injectable()
export class SaleNotifier {
  private readonly logger = new Logger(SaleNotifier.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
    private readonly alerts: AdminAlertsService,
  ) {}

  async notifyPaid(orderId: string): Promise<void> {
    try {
      // telegramId as text: bigint, and the owner may never have logged in (no users row).
      const [sale]: Sale[] = await this.dataSource.query(
        `SELECT o."id" AS "orderId", o."amount", v."name" AS "venue", c."code", c."validUntil",
                b."telegramId"::text AS "buyerTelegramId", b."language" AS "buyerLanguage",
                m."telegramId"::text AS "ownerTelegramId", ou."language" AS "ownerLanguage"
           FROM "orders" o
           JOIN "venues" v ON v."id" = o."venueId"
           JOIN "merchants" m ON m."id" = o."merchantId"
           JOIN "users" b ON b."id" = o."userId"
           JOIN "certificates" c ON c."orderId" = o."id"
           LEFT JOIN "users" ou ON ou."telegramId" = m."telegramId"
          WHERE o."id" = $1`,
        [orderId],
      );

      if (!sale) {
        this.logger.error(
          `Sale notification for order ${orderId}: no paid order with a certificate`,
        );

        return;
      }

      const toBuyer = buyerMessage(sale.buyerLanguage ?? "kg", sale);
      const toOwner = ownerMessage(sale.ownerLanguage ?? "kg", sale);

      await Promise.all([
        this.bot.send({
          chatId: Number(sale.buyerTelegramId),
          // The number - what the buyer quotes to support (the admin «Заказы» search finds it).
          html: `${toBuyer.html}\n\n${orderNumberLine(sale.buyerLanguage ?? "kg", orderId)}`,
          button: {
            text: toBuyer.button,
            url: paymentRedirectUrl(this.finik.redirectUrl, orderId),
          },
          // Copies exactly the code (digits, no spaces) - the counter accepts it as is.
          buttons: [{ text: toBuyer.copy, copyText: sale.code }],
        }),
        this.bot.send({
          chatId: Number(sale.ownerTelegramId),
          html: toOwner.html,
          button: { text: toOwner.button, url: this.finik.redirectUrl },
        }),
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Sale notification for order ${orderId} failed: ${reason}`);
    }
  }

  // The paid amount didn't match (needs_review): money taken, no certificate. The buyer hears at
  // once that it's being checked (with the way back to the order); the admins get an alert to
  // resolve it - before this, only a log line and the next Monday reminder knew.
  async notifyNeedsReview(orderId: string, paidAmount: unknown): Promise<void> {
    try {
      const order = await this.orderForMessage(orderId);

      if (!order) {
        return;
      }

      const toBuyer = reviewMessage(order.buyerLanguage ?? "kg", order);

      await this.bot.send({
        chatId: Number(order.buyerTelegramId),
        html: `${toBuyer.html}\n\n${orderNumberLine(order.buyerLanguage ?? "kg", orderId)}`,
        button: { text: toBuyer.button, url: paymentRedirectUrl(this.finik.redirectUrl, orderId) },
      });
      await this.alerts.alert({
        kind: "needs_review",
        html: `⚠️ <b>Сумма не совпала</b> - деньги списаны, сертификат не выдан.\n\n${escapeHtml(order.venue)}: заказ ${order.amount} сом, оплачено ${escapeHtml(JSON.stringify(paidAmount))}.\nЗаказ <code>${orderId}</code>\n\nПроверить в кабинете Финика и разобрать: <code>npm run orders:resolve-review -- --order ${orderId} --issue | --refunded --note "…"</code>`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Needs-review notification for order ${orderId} failed: ${reason}`);
    }
  }

  // After the money was returned by hand (orders:resolve-review --refunded).
  async notifyRefunded(orderId: string): Promise<void> {
    try {
      const order = await this.orderForMessage(orderId);

      if (!order) {
        return;
      }

      const message = refundedMessage(order.buyerLanguage ?? "kg", order);

      await this.bot.send({
        chatId: Number(order.buyerTelegramId),
        html: `${message.html}\n\n${orderNumberLine(order.buyerLanguage ?? "kg", orderId)}`,
        button: { text: message.button, url: SUPPORT_URL },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Refund notification for order ${orderId} failed: ${reason}`);
    }
  }

  private async orderForMessage(orderId: string): Promise<{
    amount: number;
    venue: string;
    buyerTelegramId: string;
    buyerLanguage: Language | null;
  } | null> {
    const [order] = await this.dataSource.query(
      `SELECT o."amount", v."name" AS "venue",
              b."telegramId"::text AS "buyerTelegramId", b."language" AS "buyerLanguage"
         FROM "orders" o
         JOIN "venues" v ON v."id" = o."venueId"
         JOIN "users" b ON b."id" = o."userId"
        WHERE o."id" = $1`,
      [orderId],
    );

    if (!order) {
      this.logger.error(`Bot message for order ${orderId}: order not found`);
    }

    return order ?? null;
  }
}
