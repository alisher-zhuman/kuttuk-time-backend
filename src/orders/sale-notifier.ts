import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { buyerMessage, ownerMessage } from "./sale-messages";
import { paymentRedirectUrl } from "./payment-redirect-url";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

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
// sale-time owner, orders.merchantId). Best-effort — a lost message is acceptable, a delayed or
// failed webhook answer is not, so the caller doesn't wait for it and nothing here throws.
@Injectable()
export class SaleNotifier {
  private readonly logger = new Logger(SaleNotifier.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
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
          html: toBuyer.html,
          button: {
            text: toBuyer.button,
            url: paymentRedirectUrl(this.finik.redirectUrl, orderId),
          },
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
}
