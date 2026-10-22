import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { giftCard } from "./gift-messages";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { inlineKeyboard, TelegramBotService } from "@/telegram/telegram-bot.service";

export interface PreparedGift {
  preparedMessageId: string;
  expiresAt: Date;
}

// "Подарить": the backend stores a ready card with Telegram (savePreparedInlineMessage) and the
// Mini App opens Telegram's chat picker with it (shareMessage) — the buyer sends it to a friend
// as themselves. A new card per tap: Telegram expires them. Only the owner's active certificates
// (the code in the card is what the friend redeems; ownership isn't transferred).
@Injectable()
export class GiftShareService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  async prepare(
    ownerUserId: number,
    ownerTelegramId: number,
    certificateId: string,
    language: Language,
  ): Promise<PreparedGift> {
    const [row]: Array<{
      code: string;
      amount: number;
      validUntil: Date;
      status: string;
      venue: string;
      slug: string;
      logo: string;
    }> = await this.dataSource.query(
      `SELECT c."code", c."amount", c."validUntil",
              CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired'
                   ELSE c."status"::text END AS "status",
              v."name" AS "venue", v."slug", v."logo"
         FROM "certificates" c JOIN "venues" v ON v."id" = c."venueId"
        WHERE c."id" = $1 AND c."ownerUserId" = $2`,
      [certificateId, ownerUserId],
    );

    // Someone else's certificate looks the same as a missing one.
    if (!row) {
      throw new NotFoundException("Certificate not found");
    }

    if (row.status !== "active") {
      // Same error codes as redemption.
      const error = row.status === "used" ? "already_used" : "expired";

      throw new ConflictException({ message: `Certificate is ${row.status}`, error });
    }

    const card = giftCard(language, row);
    const open = new URL(this.finik.redirectUrl);

    open.searchParams.set("startapp", row.slug);

    const prepared = await this.bot.request<{ id: string; expiration_date: number }>(
      "savePreparedInlineMessage",
      {
        user_id: ownerTelegramId,
        result: {
          type: "article",
          id: certificateId,
          title: card.title,
          description: card.description,
          // Cloudinary serves any format by extension; JPEG previews most reliably in the picker.
          thumbnail_url: row.logo.replace(/\.webp$/i, ".jpg"),
          input_message_content: {
            message_text: card.html,
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
          reply_markup: inlineKeyboard([
            { text: card.open, url: open.toString() },
            { text: card.copy, copyText: row.code },
          ]),
        },
        allow_user_chats: true,
        allow_group_chats: true,
      },
      `Gift card for certificate ${certificateId}`,
    );

    if (!prepared?.id) {
      throw new BadGatewayException("Telegram is temporarily unavailable, please try again");
    }

    return {
      preparedMessageId: prepared.id,
      expiresAt: new Date(prepared.expiration_date * 1000),
    };
  }
}
