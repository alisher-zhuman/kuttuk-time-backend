// Manual resolution of an order the money came for but the system didn't settle (see CLAUDE.md →
// "needs_review runbook"):
//   npm run orders:resolve-review -- --order <uuid> --issue    [--note "…"] [--txn <finik id>] [--by alisher]
//   npm run orders:resolve-review -- --order <uuid> --refunded [--note "…"] [--by alisher]
// needs_review (amount mismatch), or expired / pending when Finik's webhook never reached us
// (then --note with the transaction checked in Finik's cabinet is required).
// Reads DATABASE_* from the env, and BOT_TOKEN + FINIK_REDIRECT_URL to tell the buyer (the code /
// "money returned") and the owner ("new sale") - without BOT_TOKEN the messages are skipped.
import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import type { ConfigType } from "@nestjs/config";
import { isUUID } from "class-validator";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../src/database/typeorm.options";
import type { finikConfig } from "../src/finik/finik.config";
import { OrderResolutionAction } from "../src/orders/entities/order-resolution.entity";
import { resolveNeedsReview } from "../src/orders/resolve-needs-review";
import { SaleNotifier } from "../src/orders/sale-notifier";
import { AdminAlertsService } from "../src/telegram/admin-alerts.service";
import { botToken } from "../src/telegram/bot-token";
import { TelegramBotService } from "../src/telegram/telegram-bot.service";

const USAGE =
  'usage: npm run orders:resolve-review -- --order <uuid> (--issue | --refunded) [--note "text"] [--txn <finik transaction id>] [--by name]';

const main = async () => {
  const { values } = parseArgs({
    options: {
      order: { type: "string" },
      issue: { type: "boolean", default: false },
      refunded: { type: "boolean", default: false },
      note: { type: "string" },
      txn: { type: "string" },
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
    // refunded / order_resolutions come with a migration - refuse on a DB that doesn't have it yet.
    if (await ds.showMigrations()) {
      throw new Error("The database has pending migrations - deploy first, then resolve.");
    }

    const result = await resolveNeedsReview(ds, {
      orderId: values.order,
      action: values.issue ? OrderResolutionAction.Issue : OrderResolutionAction.Refunded,
      note: values.note,
      finikTransactionId: values.txn?.trim() || undefined,
      resolvedBy: values.by?.trim() || userInfo().username,
    });

    process.stdout.write(
      [
        `Order   ${result.orderId}  (${result.amount} KGS)`,
        `Status  ${result.from} → ${result.to}`,
        `paidAt  ${result.paidAt?.toISOString() ?? "-"}`,
        result.certificate
          ? `Issued  ${result.certificate.code}, valid until ${result.certificate.validUntil.toISOString()}`
          : "No certificate issued - return the money to the buyer outside the system.",
        "",
      ].join("\n"),
    );

    // The same messages as the webhook path: the code to the buyer + "new sale" to the owner, or
    // "money returned". Awaited here - the process exits right after.
    if (!botToken()) {
      process.stdout.write(
        "BOT_TOKEN is not set - no bot messages sent; tell the buyer by hand.\n",
      );

      return;
    }

    const bot = new TelegramBotService();
    const finik = {
      redirectUrl: process.env.FINIK_REDIRECT_URL?.trim() || "https://t.me/kuttuk_time_bot/app",
    } as ConfigType<typeof finikConfig>;
    const notifier = new SaleNotifier(ds, bot, finik, new AdminAlertsService(ds, bot));

    if (result.certificate) {
      await notifier.notifyPaid(result.orderId);
    } else {
      await notifier.notifyRefunded(result.orderId);
    }

    process.stdout.write("Bot messages sent (see the log above for anyone who didn't get one).\n");
  } finally {
    await ds.destroy();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
