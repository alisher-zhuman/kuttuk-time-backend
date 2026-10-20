import type { DataSource, EntityManager } from "typeorm";

// One platform rate for every merchant. TODO: a per-merchant rate may be needed (CLAUDE.md).
// Finik's ~2% fee comes out of the platform's share and isn't part of the merchant report.
export const PLATFORM_COMMISSION_PERCENT = 10;

// Payout weeks are Monday 00:00 – Sunday 23:59:59 in Bishkek (UTC+6, no DST).
export const PAYOUT_TIMEZONE = "Asia/Bishkek";

// Calendar dates in Bishkek, inclusive: from 00:00 of `from` to the end of `to`.
export interface PayoutPeriod {
  from: string;
  to: string;
}

export interface MerchantPayout {
  merchantId: number;
  merchantName: string;
  ordersCount: number;
  gross: number;
  commission: number;
  payout: number;
}

export interface NeedsReviewOrder {
  orderId: string;
  merchantId: number;
  merchantName: string;
  venueName: string;
  amount: number;
  paidAt: Date | null;
  finikTransactionId: string | null;
}

export interface PayoutReport {
  period: PayoutPeriod;
  rows: MerchantPayout[];
  total: Omit<MerchantPayout, "merchantId" | "merchantName">;
  needsReview: NeedsReviewOrder[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const assertDate = (value: string, name: string): string => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (
    !DATE.test(value) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`${name} must be a date YYYY-MM-DD, got "${value}"`);
  }

  return value;
};

// Every statement in a READ ONLY transaction: Postgres itself rejects any write.
export const readOnly = <T>(ds: DataSource, work: (em: EntityManager) => Promise<T>): Promise<T> =>
  ds.transaction(async (em) => {
    await em.query("SET TRANSACTION READ ONLY");

    return work(em);
  });

// The Monday–Sunday week containing `date` — computed in SQL (Postgres weeks start on Monday).
export const weekOf = (ds: DataSource, date: string): Promise<PayoutPeriod> =>
  readOnly(ds, async (em) => {
    const [row]: Array<{ from: string; to: string }> = await em.query(
      `SELECT to_char(date_trunc('week', $1::date), 'YYYY-MM-DD') AS "from",
              to_char(date_trunc('week', $1::date) + interval '6 days', 'YYYY-MM-DD') AS "to"`,
      [assertDate(date, "week")],
    );

    return row;
  });

// The week that contains today in Bishkek.
export const currentWeek = (ds: DataSource): Promise<PayoutPeriod> =>
  readOnly(ds, async (em) => {
    const [row]: Array<{ from: string; to: string }> = await em.query(
      `SELECT to_char(date_trunc('week', (now() AT TIME ZONE '${PAYOUT_TIMEZONE}')::date), 'YYYY-MM-DD') AS "from",
              to_char(date_trunc('week', (now() AT TIME ZONE '${PAYOUT_TIMEZONE}')::date) + interval '6 days', 'YYYY-MM-DD') AS "to"`,
    );

    return row;
  });

// [from 00:00, to + 1 day 00:00) in Bishkek, as timestamptz — `timestamp AT TIME ZONE zone`
// reads a wall-clock time in that zone. $1 = from, $2 = to.
export const IN_PERIOD = (column: string) =>
  `${column} >= ($1::date)::timestamp AT TIME ZONE '${PAYOUT_TIMEZONE}'
   AND ${column} < ($2::date + 1)::timestamp AT TIME ZONE '${PAYOUT_TIMEZONE}'`;

const assertPeriod = (period: PayoutPeriod): PayoutPeriod => {
  const from = assertDate(period.from, "from");
  const to = assertDate(period.to, "to");

  if (from > to) {
    throw new Error(`from (${from}) must not be after to (${to})`);
  }

  return { from, to };
};

// Paid sales per merchant — the single place that decides what counts and how money splits,
// shared by the payout report (all merchants) and the merchant cabinet (one merchant, optionally
// one of its venues). A sale belongs to orders.merchantId — the venue's owner at the moment of
// the sale — so moving a venue to another merchant never rewrites past periods.
// Paid only, by paidAt. The payout is floored on the merchant's total for the period
// (integer division), the commission is the rest — so payout + commission = gross exactly,
// and the merchant loses less than 1 KGS per period instead of up to 1 KGS per order.
// bigint integer division floors for positive values.
export const paidSales = async (
  em: EntityManager,
  period: PayoutPeriod,
  { merchantId, venueId }: { merchantId?: number; venueId?: number } = {},
): Promise<MerchantPayout[]> => {
  const { from, to } = assertPeriod(period);
  const raw: Array<Record<keyof MerchantPayout, string | number>> = await em.query(
    `SELECT "merchantId", "merchantName", "ordersCount", "gross",
            "gross" - "payout" AS "commission", "payout"
       FROM (SELECT m."id" AS "merchantId", m."name" AS "merchantName",
                    count(*)::int AS "ordersCount",
                    sum(o."amount")::bigint AS "gross",
                    sum(o."amount")::bigint * (100 - $3::int) / 100 AS "payout"
               FROM "orders" o
               JOIN "merchants" m ON m."id" = o."merchantId"
              WHERE o."status" = 'paid' AND ${IN_PERIOD('o."paidAt"')}
                AND ($4::int IS NULL OR m."id" = $4::int)
                AND ($5::int IS NULL OR o."venueId" = $5::int)
              GROUP BY m."id", m."name") per_merchant
      ORDER BY "merchantId"`,
    [from, to, PLATFORM_COMMISSION_PERCENT, merchantId ?? null, venueId ?? null],
  );

  // pg returns bigint as a string; KGS totals are far below 2^53.
  return raw.map((row) => ({
    merchantId: Number(row.merchantId),
    merchantName: String(row.merchantName),
    ordersCount: Number(row.ordersCount),
    gross: Number(row.gross),
    commission: Number(row.commission),
    payout: Number(row.payout),
  }));
};

export const buildPayoutReport = async (
  ds: DataSource,
  period: PayoutPeriod,
): Promise<PayoutReport> => {
  const { from, to } = assertPeriod(period);

  return readOnly(ds, async (em) => {
    const rows = await paidSales(em, { from, to });

    // Not paid out until resolved by hand. paidAt is set on needs_review; older rows may lack it.
    const needsReview: NeedsReviewOrder[] = await em.query(
      `SELECT o."id" AS "orderId", m."id" AS "merchantId", m."name" AS "merchantName",
              v."name" AS "venueName", o."amount", o."paidAt", o."finikTransactionId"
         FROM "orders" o
         JOIN "merchants" m ON m."id" = o."merchantId"
         JOIN "venues" v ON v."id" = o."venueId"
        WHERE o."status" = 'needs_review' AND ${IN_PERIOD('coalesce(o."paidAt", o."createdAt")')}
        ORDER BY coalesce(o."paidAt", o."createdAt")`,
      [from, to],
    );

    const total = rows.reduce(
      (acc, row) => ({
        ordersCount: acc.ordersCount + row.ordersCount,
        gross: acc.gross + row.gross,
        commission: acc.commission + row.commission,
        payout: acc.payout + row.payout,
      }),
      { ordersCount: 0, gross: 0, commission: 0, payout: 0 },
    );

    return { period: { from, to }, rows, total, needsReview };
  });
};

const csvCell = (value: string | number): string => {
  const text = String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const payoutReportCsv = (report: PayoutReport): string => {
  const lines = [
    ["merchantId", "merchantName", "ordersCount", "gross", "commission", "payout"],
    ...report.rows.map((r) => [
      r.merchantId,
      r.merchantName,
      r.ordersCount,
      r.gross,
      r.commission,
      r.payout,
    ]),
    [
      "TOTAL",
      "",
      report.total.ordersCount,
      report.total.gross,
      report.total.commission,
      report.total.payout,
    ],
  ];

  return lines.map((cells) => cells.map(csvCell).join(",")).join("\n") + "\n";
};
