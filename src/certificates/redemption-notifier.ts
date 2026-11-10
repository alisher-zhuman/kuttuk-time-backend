import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { giftUsedMessage } from "./gift-messages";
import { redeemedMessage } from "./redemption-messages";
import type { Language } from "@/common/translations";
import { SUPPORT_URL } from "@/telegram/links";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

// After a successful redemption: tell the certificate's owner - and, for a claimed gift, the one
// who gave it («Ваш подарок использовали», not «если это были не вы»). Best-effort and not awaited by the
// caller - the merchant's answer never waits on Telegram; nothing here throws.
@Injectable()
export class RedemptionNotifier {
  private readonly logger = new Logger(RedemptionNotifier.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
  ) {}

  async notifyRedeemed(code: string): Promise<void> {
    try {
      const [row]: Array<{
        code: string;
        amount: number;
        usedAt: Date;
        venue: string;
        telegramId: string;
        language: Language | null;
        giverTelegramId: string | null;
        giverLanguage: Language | null;
      }> = await this.dataSource.query(
        `SELECT c."code", c."amount", c."usedAt", v."name" AS "venue",
                u."telegramId"::text AS "telegramId", u."language",
                giver."telegramId"::text AS "giverTelegramId", giver."language" AS "giverLanguage"
           FROM "certificates" c
           JOIN "venues" v ON v."id" = c."venueId"
           JOIN "users" u ON u."id" = c."ownerUserId"
           LEFT JOIN LATERAL (
             SELECT g."fromUserId" FROM "certificate_gifts" g
              WHERE g."certificateId" = c."id" AND g."claimedByUserId" = c."ownerUserId"
              ORDER BY g."claimedAt" DESC LIMIT 1
           ) gift ON true
           LEFT JOIN "users" giver ON giver."id" = gift."fromUserId"
          WHERE c."code" = $1 AND c."status" = 'used'`,
        [code],
      );

      if (!row) {
        this.logger.error(`Redemption notification for ${code}: not a used certificate`);

        return;
      }

      const message = redeemedMessage(row.language ?? "kg", row);

      await this.bot.send({
        chatId: Number(row.telegramId),
        html: message.html,
        button: { text: message.button, url: SUPPORT_URL },
      });

      if (row.giverTelegramId) {
        await this.bot.send({
          chatId: Number(row.giverTelegramId),
          html: giftUsedMessage(row.giverLanguage ?? "kg", row),
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Redemption notification for ${code} failed: ${reason}`);
    }
  }
}
