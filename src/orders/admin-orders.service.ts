import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { OrderStatus } from "./entities/order.entity";
import { normalizeCertificateCode } from "@/certificates/certificate-code";
import type { EffectiveCertificateStatus } from "@/certificates/certificates.service";
import { decodeCursor, pageLimit, toPage } from "@/common/utils/keyset-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = Object.values(OrderStatus) as string[];

// Status-dependent keys are present only when set (the frontend parses a discriminated union):
// paidAt — paid / needs_review / refunded; certificateCode — once a certificate exists (paid).
export interface AdminOrder {
  id: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
  paidAt?: Date;
  venue: { id: number; name: string };
  merchant: { id: number; name: string };
  certificateCode?: string;
  // The payout that covered it (paid orders, once the admin marked the week paid out).
  payoutId?: string;
}

export interface AdminOrderDetail extends AdminOrder {
  expiresAt: Date;
  finikTransactionId?: string;
  buyer: { userId: number; telegramId: number };
  certificate?: {
    code: string;
    status: EffectiveCertificateStatus;
    validUntil: Date;
    usedAt?: Date;
  };
  // What Finik actually sent — for needs_review, compare `amount` with the order's.
  webhooks: Array<{ receivedAt: Date; result: string | null; amount: unknown }>;
  // Manual decisions (orders:resolve-review), oldest first.
  resolutions: Array<{
    action: string;
    fromStatus: string;
    toStatus: string;
    certificateCode?: string;
    note?: string;
    resolvedBy: string;
    resolvedAt: Date;
  }>;
}

interface Row {
  id: string;
  amount: number;
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  venueId: number;
  venueName: string;
  merchantId: number;
  merchantName: string;
  certificateCode: string | null;
  payoutId: string | null;
}

// merchant = orders.merchantId, the owner at the moment of the sale (the one it's paid out to).
const SELECT = `SELECT o."id", o."amount", o."status", o."createdAt", o."paidAt", o."payoutId",
         v."id" AS "venueId", v."name" AS "venueName",
         m."id" AS "merchantId", m."name" AS "merchantName",
         c."code" AS "certificateCode"
    FROM "orders" o
    JOIN "venues" v ON v."id" = o."venueId"
    JOIN "merchants" m ON m."id" = o."merchantId"
    LEFT JOIN "certificates" c ON c."orderId" = o."id"`;

const toItem = (row: Row): AdminOrder => ({
  id: row.id,
  amount: row.amount,
  status: row.status,
  createdAt: row.createdAt,
  ...(row.paidAt ? { paidAt: row.paidAt } : {}),
  venue: { id: row.venueId, name: row.venueName },
  merchant: { id: row.merchantId, name: row.merchantName },
  ...(row.certificateCode ? { certificateCode: row.certificateCode } : {}),
  ...(row.payoutId ? { payoutId: row.payoutId } : {}),
});

const definedOnly = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T;

// Read-only views for the admin «Заказы» tab. Resolving needs_review stays the CLI.
@Injectable()
export class AdminOrdersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(opts: {
    status?: string;
    venueId?: number;
    merchantId?: number;
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: AdminOrder[]; nextCursor: string | null }> {
    if (opts.status !== undefined && !STATUSES.includes(opts.status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(", ")}`);
    }

    const limit = pageLimit(opts.limit);
    const after = opts.cursor ? decodeCursor(opts.cursor) : null;
    const search = this.parseSearch(opts.search);

    const rows: Row[] = await this.dataSource.query(
      `${SELECT}
        WHERE ($1::text IS NULL OR o."status"::text = $1::text)
          AND ($2::int IS NULL OR o."venueId" = $2::int)
          AND ($3::int IS NULL OR o."merchantId" = $3::int)
          AND ($4::uuid IS NULL OR o."id" = $4::uuid)
          AND ($5::text IS NULL OR c."code" = $5::text)
          AND ($6::timestamptz IS NULL OR (o."createdAt", o."id") < ($6::timestamptz, $7::uuid))
        ORDER BY o."createdAt" DESC, o."id" DESC
        LIMIT $8`,
      [
        opts.status ?? null,
        opts.venueId ?? null,
        opts.merchantId ?? null,
        search?.orderId ?? null,
        search?.code ?? null,
        after?.createdAt ?? null,
        after?.id ?? null,
        limit + 1,
      ],
    );

    const { page, nextCursor } = toPage(rows, limit);

    return { items: page.map(toItem), nextCursor };
  }

  async detail(id: string): Promise<AdminOrderDetail> {
    const [row]: Array<
      Row & {
        expiresAt: Date;
        finikTransactionId: string | null;
        userId: number;
        telegramId: string;
        certificateStatus: EffectiveCertificateStatus | null;
        validUntil: Date | null;
        usedAt: Date | null;
      }
    > = await this.dataSource.query(
      `SELECT q.*, o."expiresAt", o."finikTransactionId", u."id" AS "userId",
              u."telegramId"::text AS "telegramId",
              CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired'
                   ELSE c."status"::text END AS "certificateStatus",
              c."validUntil", c."usedAt"
         FROM (${SELECT} WHERE o."id" = $1) q
         JOIN "orders" o ON o."id" = q."id"
         JOIN "users" u ON u."id" = o."userId"
         LEFT JOIN "certificates" c ON c."orderId" = o."id"`,
      [id],
    );

    if (!row) {
      throw new NotFoundException("Order not found");
    }

    const webhooks: AdminOrderDetail["webhooks"] = await this.dataSource.query(
      `SELECT "receivedAt", "result", "body"->'amount' AS "amount"
         FROM "finik_webhook_events" WHERE "orderId" = $1 ORDER BY "receivedAt"`,
      [id],
    );
    const resolutions: AdminOrderDetail["resolutions"] = await this.dataSource.query(
      `SELECT "action", "fromStatus", "toStatus", "certificateCode", "note", "resolvedBy", "resolvedAt"
         FROM "order_resolutions" WHERE "orderId" = $1 ORDER BY "resolvedAt"`,
      [id],
    );

    return {
      ...toItem(row),
      expiresAt: row.expiresAt,
      ...(row.finikTransactionId ? { finikTransactionId: row.finikTransactionId } : {}),
      buyer: { userId: row.userId, telegramId: Number(row.telegramId) },
      ...(row.certificateCode && row.certificateStatus && row.validUntil
        ? {
            certificate: {
              code: row.certificateCode,
              status: row.certificateStatus,
              validUntil: row.validUntil,
              ...(row.certificateStatus === "used" && row.usedAt ? { usedAt: row.usedAt } : {}),
            },
          }
        : {}),
      webhooks,
      resolutions: resolutions.map(definedOnly),
    };
  }

  // A certificate code (normalized as at redemption) or an order id; anything else → 400.
  private parseSearch(search?: string): { orderId?: string; code?: string } | null {
    const value = search?.trim();

    if (!value) {
      return null;
    }

    if (UUID.test(value)) {
      return { orderId: value.toLowerCase() };
    }

    const code = normalizeCertificateCode(value);

    if (!code) {
      throw new BadRequestException("search must be a certificate code or an order id");
    }

    return { code };
  }
}
