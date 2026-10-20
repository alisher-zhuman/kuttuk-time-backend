// Manual resolution of a needs_review order (see CLAUDE.md → "needs_review runbook"):
//   npm run orders:resolve-review -- --order <uuid> --issue    [--note "…"] [--by alisher]
//   npm run orders:resolve-review -- --order <uuid> --refunded [--note "…"] [--by alisher]
// Reads DATABASE_* from the env. Only needs_review orders; anything else → error, no change.
import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import { isUUID } from "class-validator";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../src/database/typeorm.options";
import { OrderResolutionAction } from "../src/orders/entities/order-resolution.entity";
import { resolveNeedsReview } from "../src/orders/resolve-needs-review";

const USAGE =
  'usage: npm run orders:resolve-review -- --order <uuid> (--issue | --refunded) [--note "text"] [--by name]';

const main = async () => {
  const { values } = parseArgs({
    options: {
      order: { type: "string" },
      issue: { type: "boolean", default: false },
      refunded: { type: "boolean", default: false },
      note: { type: "string" },
      by: { type: "string" },
    },
  });

  if (!values.order || !isUUID(values.order) || values.issue === values.refunded) {
    throw new Error(USAGE);
  }

  const ds = new DataSource({
    ...buildTypeOrmOptions((key) => process.env[key]),
    // Never touch the schema from here, whatever DB_SYNC says.
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();

  try {
    // refunded / order_resolutions come with a migration — refuse on a DB that doesn't have it yet.
    if (await ds.showMigrations()) {
      throw new Error("The database has pending migrations — deploy first, then resolve.");
    }

    const result = await resolveNeedsReview(ds, {
      orderId: values.order,
      action: values.issue ? OrderResolutionAction.Issue : OrderResolutionAction.Refunded,
      note: values.note,
      resolvedBy: values.by?.trim() || userInfo().username,
    });

    process.stdout.write(
      [
        `Order   ${result.orderId}  (${result.amount} KGS)`,
        `Status  ${result.from} → ${result.to}`,
        `paidAt  ${result.paidAt?.toISOString() ?? "-"}`,
        result.certificate
          ? `Issued  ${result.certificate.code}, valid until ${result.certificate.validUntil.toISOString()}`
          : "No certificate issued — return the money to the buyer outside the system.",
        "",
      ].join("\n"),
    );
  } finally {
    await ds.destroy();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
