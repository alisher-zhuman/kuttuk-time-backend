import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";

import { CertificatesService, type MyCertificate } from "./certificates.service";
import { effectiveStatusSql, type EffectiveCertificateStatus } from "./effective-status";
import { giftClaimedMessage } from "./gift-messages";
import { giftTokenHash, isGiftToken } from "./gift-token";
import type { Language } from "@/common/translations";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

// What the person who opened a gift link sees:
//   available - can be claimed; own - it's the caller's own link (they're the giver);
//   received - the caller already claimed it; claimed - someone else did.
// `status` (effective) says separately whether it's still usable: a used / expired one can't
// be claimed either.
export type GiftState = "available" | "own" | "received" | "claimed";

export interface GiftPreview {
  state: GiftState;
  status: EffectiveCertificateStatus;
  amount: number;
  validUntil: Date;
  venue: { id: number; name: string; slug: string; logo: string };
}

interface GiftRow {
  giftId: string;
  certificateId: string;
  fromUserId: number;
  claimedByUserId: number | null;
  ownerUserId: number;
  status: EffectiveCertificateStatus;
  amount: number;
  validUntil: Date;
  venueId: number;
  venueName: string;
  venueSlug: string;
  venueLogo: string;
}

const NOT_FOUND = "Gift not found";

// «Забрать подарок» (startapp=gift_<token>, the link in the gift card - GiftShareService). Claiming
// moves the certificate to the caller: «Мои сертификаты», the expiry reminder and the redemption
// notice are theirs from then on; the giver sees it as «Подарен». The code stays the same (the QR
// in the card keeps working). A link made obsolete by a newer card, or unknown → 404.
@Injectable()
export class GiftsService {
  private readonly logger = new Logger(GiftsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly certificates: CertificatesService,
    private readonly bot: TelegramBotService,
  ) {}

  async preview(userId: number, token: string): Promise<GiftPreview> {
    const row = await this.find(this.dataSource.manager, token);

    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }

    return {
      state: stateFor(row, userId),
      status: row.status,
      amount: row.amount,
      validUntil: row.validUntil,
      venue: { id: row.venueId, name: row.venueName, slug: row.venueSlug, logo: row.venueLogo },
    };
  }

  // 200 + the certificate as in GET /certificates/my. Tapping again after a success → the same
  // 200 (idempotent). Otherwise 409: own | already_claimed | already_used | expired.
  async claim(userId: number, token: string): Promise<MyCertificate> {
    const { certificate, giverId } = await this.dataSource.transaction(async (em) => {
      const found = await this.find(em, token);

      if (!found) {
        throw new NotFoundException(NOT_FOUND);
      }

      // Lock order: the certificate, then the gift - the same as «Подарить», so the two never
      // deadlock. Concurrent claims serialize here; the second sees claimedByUserId.
      await em.query(`SELECT 1 FROM "certificates" WHERE "id" = $1 FOR UPDATE`, [
        found.certificateId,
      ]);

      const row = await this.find(em, token, true);

      if (!row) {
        throw new NotFoundException(NOT_FOUND); // replaced by a newer card meanwhile
      }

      const state = stateFor(row, userId);

      if (state === "received") {
        return { certificate: await this.mine(em, userId, row.certificateId), giverId: null };
      }

      if (state === "own") {
        throw new ConflictException({ message: "This is your own certificate", error: "own" });
      }

      if (state === "claimed") {
        throw new ConflictException({
          message: "The gift was already claimed",
          error: "already_claimed",
        });
      }

      if (row.status !== "active") {
        const error = row.status === "used" ? "already_used" : "expired";

        throw new ConflictException({ message: `Certificate is ${row.status}`, error });
      }

      // The new owner gets their own "expires soon" reminder.
      await em.query(
        `UPDATE "certificates" SET "ownerUserId" = $2, "expiryRemindedAt" = NULL WHERE "id" = $1`,
        [row.certificateId, userId],
      );
      await em.query(
        `UPDATE "certificate_gifts" SET "claimedAt" = now(), "claimedByUserId" = $2 WHERE "id" = $1`,
        [row.giftId, userId],
      );

      return {
        certificate: await this.mine(em, userId, row.certificateId),
        giverId: row.fromUserId,
      };
    });

    if (giverId !== null) {
      this.logger.log(`Gift claimed: certificate ${certificate.id} user ${giverId} → ${userId}`);
      // Not awaited: the friend's answer never waits on Telegram.
      void this.notifyGiver(giverId, certificate);
    }

    return certificate;
  }

  private async mine(
    em: EntityManager,
    userId: number,
    certificateId: string,
  ): Promise<MyCertificate> {
    const [certificate] = await this.certificates.findMine(userId, certificateId, em);

    return certificate;
  }

  // The gift (only the link still open, or the one that was claimed) with its certificate.
  private async find(em: EntityManager, token: string, lock = false): Promise<GiftRow | null> {
    if (!isGiftToken(token)) {
      return null;
    }

    const [row]: GiftRow[] = await em.query(
      `SELECT g."id" AS "giftId", g."certificateId", g."fromUserId", g."claimedByUserId",
              c."ownerUserId", ${effectiveStatusSql("c")} AS "status", c."amount", c."validUntil",
              v."id" AS "venueId", v."name" AS "venueName", v."slug" AS "venueSlug",
              v."logo" AS "venueLogo"
         FROM "certificate_gifts" g
         JOIN "certificates" c ON c."id" = g."certificateId"
         JOIN "venues" v ON v."id" = c."venueId"
        WHERE g."tokenHash" = $1
        ${lock ? `FOR UPDATE OF g` : ""}`,
      [giftTokenHash(token)],
    );

    return row ?? null;
  }

  private async notifyGiver(giverId: number, certificate: MyCertificate): Promise<void> {
    try {
      const [giver]: Array<{ telegramId: string; language: Language | null }> =
        await this.dataSource.query(
          `SELECT "telegramId"::text AS "telegramId", "language" FROM "users" WHERE "id" = $1`,
          [giverId],
        );

      if (giver) {
        await this.bot.send({
          chatId: Number(giver.telegramId),
          html: giftClaimedMessage(giver.language ?? "kg", {
            venue: certificate.venue.name,
            amount: certificate.amount,
          }),
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Gift claimed notice for ${certificate.id} failed: ${reason}`);
    }
  }
}

const stateFor = (row: GiftRow, userId: number): GiftState => {
  if (row.claimedByUserId !== null) {
    return row.claimedByUserId === userId ? "received" : "claimed";
  }

  return row.fromUserId === userId ? "own" : "available";
};
