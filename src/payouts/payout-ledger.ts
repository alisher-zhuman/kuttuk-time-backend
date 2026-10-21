import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";

import { Payout } from "./entities/payout.entity";
import { IN_PERIOD, PLATFORM_COMMISSION_PERCENT, type PayoutPeriod } from "./payouts-report";

// What has been paid out, and what's still due. Paying out is manual (the admin transfers the
// money, then marks it here); a mark links the orders it covers (orders.payoutId), so an order
// that lands in a week after it was marked (a late webhook, a resolved needs_review) shows up
// as due instead of being silently treated as paid.

export class NothingToPayOutError extends Error {}

// The same rule as paidSales(): floor the merchant's share on the total, commission = the rest.
export const splitGross = (gross: number): { payout: number; commission: number } => {
  const payout = Math.floor((gross * (100 - PLATFORM_COMMISSION_PERCENT)) / 100);

  return { payout, commission: gross - payout };
};

export interface PayoutProgress {
  // Sum of the payouts recorded for this merchant and week.
  paidOut: number;
  // The merchant's share of the paid orders of the week not covered by a payout yet.
  due: number;
}

// Per merchant with paid orders in the period (all merchants, or one).
export const payoutProgress = async (
  em: EntityManager,
  period: PayoutPeriod,
  merchantId?: number,
): Promise<Map<number, PayoutProgress>> => {
  const rows: Array<{ merchantId: number; unpaid: string; paidOut: string }> = await em.query(
    `SELECT o."merchantId",
            coalesce(sum(o."amount") FILTER (WHERE o."payoutId" IS NULL), 0)::bigint AS "unpaid",
            (SELECT coalesce(sum(p."payout"), 0)::bigint FROM "payouts" p
              WHERE p."merchantId" = o."merchantId"
                AND p."periodFrom" = $1::date AND p."periodTo" = $2::date) AS "paidOut"
       FROM "orders" o
      WHERE o."status" = 'paid' AND ${IN_PERIOD('o."paidAt"')}
        AND ($3::int IS NULL OR o."merchantId" = $3::int)
      GROUP BY o."merchantId"`,
    [period.from, period.to, merchantId ?? null],
  );

  return new Map(
    rows.map((row) => [
      Number(row.merchantId),
      { paidOut: Number(row.paidOut), due: splitGross(Number(row.unpaid)).payout },
    ]),
  );
};

// Record that the merchant was paid for its not-yet-paid-out orders of the week. The amount is
// computed here from those orders — never taken from the client. The orders are locked, so two
// simultaneous marks can't both cover them: the second finds nothing left → NothingToPayOutError.
export const markPaidOut = (
  ds: DataSource,
  input: { merchantId: number; period: PayoutPeriod; note?: string | null; paidBy: number },
): Promise<Payout> =>
  ds.transaction(async (em) => {
    const { merchantId, period } = input;
    const orders: Array<{ id: string; amount: number }> = await em.query(
      `SELECT o."id", o."amount" FROM "orders" o
        WHERE o."merchantId" = $3 AND o."status" = 'paid' AND o."payoutId" IS NULL
          AND ${IN_PERIOD('o."paidAt"')}
        FOR UPDATE`,
      [period.from, period.to, merchantId],
    );

    if (orders.length === 0) {
      throw new NothingToPayOutError(
        `Nothing to pay out to merchant ${merchantId} for ${period.from}–${period.to}`,
      );
    }

    const gross = orders.reduce((sum, order) => sum + order.amount, 0);
    const payout = em.create(Payout, {
      id: randomUUID(),
      merchantId,
      periodFrom: period.from,
      periodTo: period.to,
      ordersCount: orders.length,
      gross,
      ...splitGross(gross),
      note: input.note?.trim() || null,
      paidBy: input.paidBy,
    });

    await em.save(payout);

    // Second guard, independent of the lock above: only still-unpaid orders get linked, and all
    // of them must be — otherwise another payout took some, and this one rolls back.
    const [, linked]: [unknown, number] = await em.query(
      `UPDATE "orders" SET "payoutId" = $1, "updatedAt" = now()
        WHERE "id" = ANY($2::uuid[]) AND "payoutId" IS NULL`,
      [payout.id, orders.map((order) => order.id)],
    );

    if (linked !== orders.length) {
      throw new NothingToPayOutError(
        `Orders of merchant ${merchantId} for ${period.from}–${period.to} were paid out concurrently`,
      );
    }

    return payout;
  });
