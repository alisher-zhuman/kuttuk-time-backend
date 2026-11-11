import {
  BadGatewayException,
  ConflictException,
  ServiceUnavailableException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { IsNull, type DataSource } from "typeorm";

import { giftCard } from "./gift-messages";
import { effectiveStatusSql } from "./effective-status";
import { CertificateGift } from "./entities/certificate-gift.entity";
import { generateGiftToken, GIFT_START_PARAM_PREFIX, giftTokenHash } from "./gift-token";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { miniAppLink, qrImageUrl, webGiftUrl } from "@/orders/payment-redirect-url";
import { websiteUrl } from "@/common/website-url";
import { inlineKeyboard, TelegramBotService } from "@/telegram/telegram-bot.service";

export interface PreparedGift {
  preparedMessageId: string;
  expiresAt: Date;
}

// "Подарить": the backend stores a ready card with Telegram (savePreparedInlineMessage) and the
// Mini App opens Telegram's chat picker with it (shareMessage) - the owner sends it to a friend
// as themselves. A new card per tap: Telegram expires them. Only the owner's active certificates.
// The card carries the code (redeemable as is) and a «Забрать подарок» link (startapp=gift_<token>,
// see GiftsService) that moves the certificate to the friend. Each new card replaces the link of
// the previous one that nobody claimed - sent to the wrong person → send again.
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
    }> = await this.dataSource.query(
      `SELECT c."code", c."amount", c."validUntil",
              ${effectiveStatusSql("c")} AS "status",
              v."name" AS "venue", v."slug"
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
    const token = generateGiftToken();
    const claim = miniAppLink(this.finik.redirectUrl, `${GIFT_START_PARAM_PREFIX}${token}`);
    const qr = qrImageUrl(this.finik.webhookUrl, row.code);

    const prepared = await this.bot.request<{ id: string; expiration_date: number }>(
      "savePreparedInlineMessage",
      {
        user_id: ownerTelegramId,
        // A photo of the code's QR with the text as its caption: until the friend claims it,
        // this message is what they show at the counter - the cashier scans it. Telegram takes
        // an inline photo only as a JPEG URL.
        result: {
          type: "photo",
          id: certificateId,
          photo_url: qr,
          thumbnail_url: qr,
          title: card.title,
          description: card.description,
          caption: card.html,
          parse_mode: "HTML",
          reply_markup: inlineKeyboard([
            { text: card.claim, url: claim },
            { text: card.copy, copyText: row.code },
          ]),
        },
        // A gift is for one person: in a group everyone would see the code and the link.
        allow_user_chats: true,
        allow_group_chats: false,
      },
      `Gift card for certificate ${certificateId}`,
    );

    if (!prepared?.id) {
      throw new BadGatewayException("Telegram is temporarily unavailable, please try again");
    }

    // Only now that the card exists: replace the open link.
    await this.saveGiftLink(ownerUserId, certificateId, token);

    return {
      preparedMessageId: prepared.id,
      expiresAt: new Date(prepared.expiration_date * 1000),
    };
  }

  // «Подарить» on the website (docs/web-version.md): a plain link to the gift page, shared from
  // the phone's own share menu (WhatsApp, Instagram, SMS…). The same certificate_gifts row as the
  // Telegram card - a new link replaces the previous unclaimed one. Works for a guest too.
  async link(ownerUserId: number, certificateId: string): Promise<{ url: string }> {
    const site = websiteUrl();

    if (!site) {
      throw new ServiceUnavailableException("The website address isn't configured");
    }

    const token = generateGiftToken();

    await this.saveGiftLink(ownerUserId, certificateId, token);

    return { url: webGiftUrl(site, token) };
  }

  // Replaces the certificate's open gift link with `token`, if it's still the caller's and active
  // (a redemption or a claim could have landed meanwhile). Not theirs → 404; used / expired → 409.
  private async saveGiftLink(
    ownerUserId: number,
    certificateId: string,
    token: string,
  ): Promise<void> {
    const saved = await this.dataSource.transaction(async (em) => {
      const [locked]: Array<{ id: string }> = await em.query(
        `SELECT c."id" FROM "certificates" c
          WHERE c."id" = $1 AND c."ownerUserId" = $2 AND ${effectiveStatusSql("c")} = 'active'
            FOR UPDATE`,
        [certificateId, ownerUserId],
      );

      if (!locked) {
        const [now]: Array<{ status: string }> = await em.query(
          `SELECT ${effectiveStatusSql("c")} AS "status" FROM "certificates" c
            WHERE c."id" = $1 AND c."ownerUserId" = $2`,
          [certificateId, ownerUserId],
        );

        return !now ? "gone" : now.status === "used" ? "already_used" : "expired";
      }

      await em.delete(CertificateGift, { certificateId, claimedAt: IsNull() });
      await em.insert(CertificateGift, {
        id: randomUUID(),
        certificateId,
        fromUserId: ownerUserId,
        tokenHash: giftTokenHash(token),
        claimedAt: null,
        claimedByUserId: null,
      });

      return true as const;
    });

    // Claimed by someone meanwhile → not theirs any more (404); used / expired → the usual 409.
    if (saved !== true) {
      if (saved === "gone") {
        throw new NotFoundException("Certificate not found");
      }

      throw new ConflictException({ message: `Certificate is ${saved}`, error: saved });
    }
  }
}
