// Weekly merchant payout report (read-only): `npm run report:payouts -- --week 2026-10-19`
// or `-- --from 2026-10-19 --to 2026-10-25` (dates in Bishkek). Reads DATABASE_* from the env.
// stdout: the CSV, then (after a blank line) the period, the file path and any needs_review orders.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../src/database/typeorm.options";
import {
  buildPayoutReport,
  payoutReportCsv,
  weekOf,
  type PayoutPeriod,
} from "../src/payouts/payouts-report";

const USAGE =
  "usage: npm run report:payouts -- --week YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD";

const main = async () => {
  const { values } = parseArgs({
    options: { week: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
  });
  const byWeek = values.week !== undefined;
  const byRange = values.from !== undefined || values.to !== undefined;

  // Exactly one mode; a range needs both ends.
  if (byWeek === byRange || (byRange && (values.from === undefined || values.to === undefined))) {
    throw new Error(USAGE);
  }

  const ds = new DataSource({
    ...buildTypeOrmOptions((key) => process.env[key]),
    // A report must never touch the schema, whatever DB_SYNC says.
    synchronize: false,
    migrationsRun: false,
    entities: [],
    migrations: [],
  });

  await ds.initialize();

  try {
    const period: PayoutPeriod = byWeek
      ? await weekOf(ds, values.week!)
      : { from: values.from!, to: values.to! };
    const report = await buildPayoutReport(ds, period);
    const csv = payoutReportCsv(report);
    const dir = join(process.cwd(), "reports");
    const file = join(dir, `payouts-${report.period.from}_${report.period.to}.csv`);

    mkdirSync(dir, { recursive: true });
    writeFileSync(file, csv);

    process.stdout.write(csv);
    process.stdout.write(
      `\nPeriod: ${report.period.from} 00:00 – ${report.period.to} 23:59:59 (Asia/Bishkek). Saved: ${file}\n`,
    );

    if (report.needsReview.length > 0) {
      process.stdout.write(
        `\n⚠ ${report.needsReview.length} order(s) in needs_review — resolve them before paying out (not in the CSV):\n`,
      );

      for (const o of report.needsReview) {
        process.stdout.write(
          `  ${o.orderId}  merchant ${o.merchantId} "${o.merchantName}"  ${o.amount} KGS  paidAt=${o.paidAt?.toISOString() ?? "-"}  finik=${o.finikTransactionId ?? "-"}\n`,
        );
      }
    }
  } finally {
    await ds.destroy();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
