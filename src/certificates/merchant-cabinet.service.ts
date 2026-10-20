import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { ownMerchantId } from "./own-merchant";
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
export const CABINET_PAGE_DEFAULT = 50;
export const CABINET_PAGE_MAX = 100;

const EFFECTIVE_STATUS = `CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired' ELSE c."status"::text END`;

// Opaque to the client: "<createdAt ISO>|<id>" in base64url — keyset pagination, stable
// under new sales (new rows land on top, never inside an already-read page).
const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (Number.isNaN(createdAt.getTime()) || !id || !UUID.test(id)) {
    throw new BadRequestException("Invalid cursor");
  }

  return { createdAt, id };
};

@Injectable()
export class MerchantCabinetService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // The Mon–Sun week (Bishkek) containing `week`, or the current one. "Sold" and "payout" come
  // from paidSales() — the same code as the payout report, so the numbers can't drift apart.
  async summary(merchantTelegramId: number, week?: string): Promise<MerchantWeekSummary> {
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);
    let period: PayoutPeriod;

    try {
      period = week ? await weekOf(this.dataSource, week) : await currentWeek(this.dataSource);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid week");
    }

    return readOnly(this.dataSource, async (em) => {
      const [sales] = await paidSales(em, period, merchantId);
      const [redeemed]: Array<{ count: number; amount: string }> = await em.query(
        `SELECT count(*)::int AS "count", coalesce(sum(c."amount"), 0)::bigint AS "amount"
           FROM "certificates" c
          WHERE c."merchantId" = $3 AND c."status" = 'used' AND ${IN_PERIOD('c."usedAt"')}`,
        [period.from, period.to, merchantId],
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

  // Own certificates, newest first, optionally by effective status. Keyset-paginated.
  async list(
    merchantTelegramId: number,
    opts: { status?: string; limit?: number; cursor?: string },
  ): Promise<MerchantCertificatePage> {
    if (opts.status !== undefined && !CABINET_STATUSES.includes(opts.status as never)) {
      throw new BadRequestException(`status must be one of: ${CABINET_STATUSES.join(", ")}`);
    }

    const limit = opts.limit ?? CABINET_PAGE_DEFAULT;

    if (!Number.isInteger(limit) || limit < 1 || limit > CABINET_PAGE_MAX) {
      throw new BadRequestException(`limit must be 1–${CABINET_PAGE_MAX}`);
    }

    const after = opts.cursor ? decodeCursor(opts.cursor) : null;
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);

    const rows: Array<{
      id: string;
      code: string;
      amount: number;
      status: EffectiveCertificateStatus;
      validUntil: Date;
      usedAt: Date | null;
      createdAt: Date;
    }> = await this.dataSource.query(
      `SELECT * FROM (
         SELECT c."id", c."code", c."amount", ${EFFECTIVE_STATUS} AS "status",
                c."validUntil", c."usedAt", c."createdAt"
           FROM "certificates" c
          WHERE c."merchantId" = $1
            AND ($2::timestamptz IS NULL OR (c."createdAt", c."id") < ($2::timestamptz, $3::uuid))
       ) own
       WHERE ($4::text IS NULL OR own."status" = $4::text)
       ORDER BY own."createdAt" DESC, own."id" DESC
       LIMIT $5`,
      [merchantId, after?.createdAt ?? null, after?.id ?? null, opts.status ?? null, limit + 1],
    );

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        code: row.code,
        amount: row.amount,
        status: row.status,
        validUntil: row.validUntil,
        ...(row.status === "used" && row.usedAt ? { usedAt: row.usedAt } : {}),
        createdAt: row.createdAt,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}
