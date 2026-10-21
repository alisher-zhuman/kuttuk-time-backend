import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";

import { ownMerchantId } from "./own-merchant";
import { decodeCursor, pageLimit, toPage } from "@/common/utils/keyset-page";
import type { EffectiveCertificateStatus } from "./certificates.service";
import type { MerchantCertificate } from "./redemption.service";
import {
  currentWeek,
  IN_PERIOD,
  paidSales,
  readOnly,
  weekOf,
  type PayoutPeriod,
} from "@/payouts/payouts-report";

export interface MerchantWeekSummary {
  from: string;
  to: string;
  sold: { count: number; amount: number };
  commission: number;
  payout: number;
  redeemed: { count: number; amount: number };
}

export interface MerchantCertificatePage {
  items: MerchantCertificate[];
  nextCursor: string | null;
}

export const CABINET_STATUSES: EffectiveCertificateStatus[] = ["active", "used", "expired"];

const EFFECTIVE_STATUS = `CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired' ELSE c."status"::text END`;

// ?venueId= must be one of the caller's venues; another merchant's looks like a missing one.
const assertOwnVenue = async (
  db: DataSource | EntityManager,
  merchantId: number,
  venueId: number,
): Promise<void> => {
  const [venue]: Array<{ id: number }> = await db.query(
    `SELECT "id" FROM "venues" WHERE "id" = $1 AND "merchantId" = $2`,
    [venueId, merchantId],
  );

  if (!venue) {
    throw new NotFoundException("Venue not found");
  }
};

@Injectable()
export class MerchantCabinetService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // The Mon–Sun week (Bishkek) containing `week`, or the current one. "Sold" and "payout" come
  // from paidSales() — the same code as the payout report, so the numbers can't drift apart.
  // venueId narrows everything to one of the merchant's venues.
  async summary(
    merchantTelegramId: number,
    opts: { week?: string; venueId?: number } = {},
  ): Promise<MerchantWeekSummary> {
    const { week, venueId } = opts;
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);

    if (venueId !== undefined) {
      await assertOwnVenue(this.dataSource, merchantId, venueId);
    }

    let period: PayoutPeriod;

    try {
      period = week ? await weekOf(this.dataSource, week) : await currentWeek(this.dataSource);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid week");
    }

    return readOnly(this.dataSource, async (em) => {
      const [sales] = await paidSales(em, period, { merchantId, venueId });
      // Redeemed = by the venues the merchant owns now (the same scope as redemption).
      const [redeemed]: Array<{ count: number; amount: string }> = await em.query(
        `SELECT count(*)::int AS "count", coalesce(sum(c."amount"), 0)::bigint AS "amount"
           FROM "certificates" c
           JOIN "venues" v ON v."id" = c."venueId" AND v."merchantId" = $3
          WHERE ($4::int IS NULL OR c."venueId" = $4::int)
            AND c."status" = 'used' AND ${IN_PERIOD('c."usedAt"')}`,
        [period.from, period.to, merchantId, venueId ?? null],
      );

      return {
        from: period.from,
        to: period.to,
        sold: { count: sales?.ordersCount ?? 0, amount: sales?.gross ?? 0 },
        commission: sales?.commission ?? 0,
        payout: sales?.payout ?? 0,
        redeemed: { count: redeemed.count, amount: Number(redeemed.amount) },
      };
    });
  }

  // Certificates of the merchant's venues, newest first, optionally by effective status and
  // one venue. Keyset-paginated.
  async list(
    merchantTelegramId: number,
    opts: { status?: string; limit?: number; cursor?: string; venueId?: number },
  ): Promise<MerchantCertificatePage> {
    if (opts.status !== undefined && !CABINET_STATUSES.includes(opts.status as never)) {
      throw new BadRequestException(`status must be one of: ${CABINET_STATUSES.join(", ")}`);
    }

    const limit = pageLimit(opts.limit);

    const after = opts.cursor ? decodeCursor(opts.cursor) : null;
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);

    if (opts.venueId !== undefined) {
      await assertOwnVenue(this.dataSource, merchantId, opts.venueId);
    }

    const rows: Array<{
      id: string;
      code: string;
      amount: number;
      status: EffectiveCertificateStatus;
      validUntil: Date;
      usedAt: Date | null;
      createdAt: Date;
      venueId: number;
      venueName: string;
    }> = await this.dataSource.query(
      `SELECT * FROM (
         SELECT c."id", c."code", c."amount", ${EFFECTIVE_STATUS} AS "status",
                c."validUntil", c."usedAt", c."createdAt",
                v."id" AS "venueId", v."name" AS "venueName"
           FROM "certificates" c
           JOIN "venues" v ON v."id" = c."venueId" AND v."merchantId" = $1
          WHERE ($6::int IS NULL OR c."venueId" = $6::int)
            AND ($2::timestamptz IS NULL OR (c."createdAt", c."id") < ($2::timestamptz, $3::uuid))
       ) own
       WHERE ($4::text IS NULL OR own."status" = $4::text)
       ORDER BY own."createdAt" DESC, own."id" DESC
       LIMIT $5`,
      [
        merchantId,
        after?.createdAt ?? null,
        after?.id ?? null,
        opts.status ?? null,
        limit + 1,
        opts.venueId ?? null,
      ],
    );

    const { page, nextCursor } = toPage(rows, limit);

    return {
      items: page.map((row) => ({
        code: row.code,
        amount: row.amount,
        status: row.status,
        validUntil: row.validUntil,
        ...(row.status === "used" && row.usedAt ? { usedAt: row.usedAt } : {}),
        createdAt: row.createdAt,
        venue: { id: row.venueId, name: row.venueName },
      })),
      nextCursor,
    };
  }
}
