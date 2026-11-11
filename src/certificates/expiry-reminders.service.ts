import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { expiryMessage } from "./expiry-messages";
import type { Language } from "@/common/translations";
import { bishkekTime } from "@/common/utils/bishkek-format";
import { finikConfig } from "@/finik/finik.config";
import {
  miniAppLink,
  MY_CERTIFICATES_START_PARAM,
  paymentRedirectUrl,
} from "@/orders/payment-redirect-url";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

export const EXPIRY_REMINDER_DAYS = 7;
// Only in the daytime in Bishkek: [from, to) hours.
export const EXPIRY_REMINDER_HOURS = { from: 9, to: 21 } as const;
const BATCH = 100;

// "Expires soon" reminders: an active, unredeemed certificate with ≤ 7 days left gets one
// message to its owner. Hourly rather than daily - Koyeb sleeps, so a fixed daily run could be
// missed; the window catches up on the next run. Each certificate is claimed (expiryRemindedAt)
// before sending, so it's reminded at most once even if two runs overlap; a refused send (403 -
// never started the bot) isn't retried, a network failure is (the claim is released).
@Injectable()
export class ExpiryRemindersService {
  private readonly logger = new Logger(ExpiryRemindersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourly(): Promise<void> {
    await this.run();
  }

  // Returns how many reminders were claimed (and sent, best-effort).
  async run(now: Date = new Date()): Promise<number> {
    const hour = Number(bishkekTime(now).slice(0, 2));

    if (hour < EXPIRY_REMINDER_HOURS.from || hour >= EXPIRY_REMINDER_HOURS.to) {
      return 0;
    }

    const claimed: Array<{
      id: string;
      orderId: string;
      gifted: boolean;
      code: string;
      amount: number;
      validUntil: Date;
      venue: string;
      telegramId: string;
      language: Language | null;
    }> = await this.dataSource.query(
      `WITH due AS (
         SELECT c."id" FROM "certificates" c
           JOIN "users" owner ON owner."id" = c."ownerUserId"
          WHERE c."status" = 'active' AND c."expiryRemindedAt" IS NULL
            -- A website guest has no Telegram chat: not claimed, so the reminder still comes
            -- once they log in with Telegram (their certificates move to that account).
            AND owner."telegramId" IS NOT NULL
            AND c."validUntil" > $1::timestamptz
            AND c."validUntil" <= $1::timestamptz + make_interval(days => $2::int)
          ORDER BY c."validUntil"
          LIMIT $3
          FOR UPDATE OF c SKIP LOCKED
       ), claimed AS (
         UPDATE "certificates" c SET "expiryRemindedAt" = $1::timestamptz
           FROM due WHERE c."id" = due."id" AND c."expiryRemindedAt" IS NULL
         RETURNING c.*
       )
       SELECT c."id", c."orderId", c."ownerUserId" <> o."userId" AS "gifted", c."code", c."amount", c."validUntil", v."name" AS "venue",
              u."telegramId"::text AS "telegramId", u."language"
         FROM claimed c
         JOIN "orders" o ON o."id" = c."orderId"
         JOIN "venues" v ON v."id" = c."venueId"
         JOIN "users" u ON u."id" = c."ownerUserId"`,
      [now, EXPIRY_REMINDER_DAYS, BATCH],
    );

    for (const certificate of claimed) {
      const message = expiryMessage(certificate.language ?? "kg", certificate);

      const result = await this.bot.deliverResult({
        chatId: Number(certificate.telegramId),
        html: message.html,
        button: {
          text: message.button,
          // A gift's owner isn't the buyer - the order screen isn't theirs to open.
          url: certificate.gifted
            ? miniAppLink(this.finik.redirectUrl, MY_CERTIFICATES_START_PARAM)
            : paymentRedirectUrl(this.finik.redirectUrl, certificate.orderId),
        },
      });

      // A network / Telegram failure: release the claim, the next hourly run tries again. A
      // refusal (blocked the bot / never started it) stays claimed - retrying can't help.
      if (result === "failed") {
        await this.dataSource.query(
          `UPDATE "certificates" SET "expiryRemindedAt" = NULL WHERE "id" = $1 AND "expiryRemindedAt" = $2`,
          [certificate.id, now],
        );
      }
    }

    if (claimed.length > 0) {
      this.logger.log(`Expiry reminders sent: ${claimed.length}`);
    }

    return claimed.length;
  }
}
