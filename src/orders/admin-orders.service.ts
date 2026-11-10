import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { OrderStatus } from "./entities/order.entity";
import { orderNumber } from "./order-number";
import { normalizeCertificateCode } from "@/certificates/certificate-code";
import { effectiveStatusSql, usedAtField } from "@/certificates/effective-status";
import type { EffectiveCertificateStatus } from "@/certificates/effective-status";
import { CURSOR_AT, decodeCursor, pageLimit, toPage } from "@/common/utils/keyset-page";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = Object.values(OrderStatus) as string[];

// Status-dependent keys are present only when set (the frontend parses a discriminated union):
// paidAt - paid / needs_review / refunded; certificateCode - once a certificate exists (paid).
export interface AdminOrder {
  id: string;
  // «Заказ №A1B2C3D4» - what the buyer sees and quotes.
  number: string;
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
  // false: Finik never created a payment (it failed at POST /orders) - an `expired` order then
  // means "Finik failed", not "the buyer didn't pay".
  paymentCreated: boolean;
  finikTransactionId?: string;
  buyer: { userId: number; telegramId: number };
  certificate?: {
    code: string;
    status: EffectiveCertificateStatus;
    validUntil: Date;
    usedAt?: Date;
  };
  // What Finik actually sent - for needs_review, compare `amount` with the order's.
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
  cursorAt: string;
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
         ${CURSOR_AT('o."createdAt"')} AS "cursorAt",
         v."id" AS "venueId", v."name" AS "venueName",
         m."id" AS "merchantId", m."name" AS "merchantName",
         c."code" AS "certificateCode"
    FROM "orders" o
    JOIN "venues" v ON v."id" = o."venueId"
    JOIN "merchants" m ON m."id" = o."merchantId"
    LEFT JOIN "certificates" c ON c."orderId" = o."id"`;

const toItem = (row: Row): AdminOrder => ({
  id: row.id,
  number: orderNumber(row.id),
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
    userId?: number;
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
          AND (($5::text IS NULL AND $9::text IS NULL)
               OR c."code" = $5::text OR left(o."id"::text, 8) = $9::text)
          AND ($10::text IS NULL OR o."finikTransactionId" = $10::text)
          AND ($11::int IS NULL OR o."userId" = $11::int)
          AND ($6::timestamptz IS NULL OR (o."createdAt", o."id") < ($6::timestamptz, $7::uuid))
        ORDER BY o."createdAt" DESC, o."id" DESC
        LIMIT $8`,
      [
        opts.status ?? null,
        opts.venueId ?? null,
        opts.merchantId ?? null,
        search?.orderId ?? null,
        search?.code ?? null,
        after?.at ?? null,
        after?.id ?? null,
        limit + 1,
        search?.numberPrefix ?? null,
        search?.finikTransactionId ?? null,
        opts.userId ?? null,
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
        paymentCreated: boolean;
      }
    > = await this.dataSource.query(
      `SELECT q.*, o."expiresAt", o."finikTransactionId", u."id" AS "userId",
              o."paymentUrl" IS NOT NULL AS "paymentCreated",
              u."telegramId"::text AS "telegramId",
              ${effectiveStatusSql("c")} AS "certificateStatus",
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
      paymentCreated: row.paymentCreated,
      ...(row.finikTransactionId ? { finikTransactionId: row.finikTransactionId } : {}),
      buyer: { userId: row.userId, telegramId: Number(row.telegramId) },
      ...(row.certificateCode && row.certificateStatus && row.validUntil
        ? {
            certificate: {
              code: row.certificateCode,
              status: row.certificateStatus,
              validUntil: row.validUntil,
              ...usedAtField(row.certificateStatus, row.usedAt),
            },
          }
        : {}),
      webhooks,
      resolutions: resolutions.map(definedOnly),
    };
  }

  // What support has from the buyer: an order id; the order number (8 hex chars, «№A1B2C3D4» -
  // "№" / "#" ignored); a certificate code (normalized as at redemption) - 8 digits match both a
  // code and an order number; a Finik transaction id (from Finik's cabinet, exact). Else → 400.
  private parseSearch(search?: string): {
    orderId?: string;
    code?: string;
    numberPrefix?: string;
    finikTransactionId?: string;
  } | null {
    const value = search?.trim().replace(/^[№#]\s*/, "");

    if (!value) {
      return null;
    }

    if (UUID.test(value)) {
      return { orderId: value.toLowerCase() };
    }

    const numberPrefix = /^[0-9a-f]{8}$/i.test(value) ? value.toLowerCase() : undefined;
    const code = normalizeCertificateCode(value) ?? undefined;

    if (numberPrefix || code) {
      return { numberPrefix, code };
    }

    if (/^[A-Za-z0-9_-]{6,200}$/.test(value)) {
      return { finikTransactionId: value };
    }

    throw new BadRequestException(
      "search must be an order id or number, a certificate code or a Finik transaction id",
    );
  }
}
