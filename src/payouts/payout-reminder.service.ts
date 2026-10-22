import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { payoutProgress, unpaidBefore } from "./payout-ledger";
import { payoutReminderMessage } from "./payout-reminder-messages";
import { buildPayoutReport, readOnly, weekOf } from "./payouts-report";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

const KIND = "admin_payouts";
// Monday, from 09:00 to 21:00 in Bishkek (UTC+6, no DST — like the payout weeks).
const BISHKEK_OFFSET_MS = 6 * 60 * 60 * 1000;
export const PAYOUT_REMINDER_HOURS = { from: 9, to: 21 } as const;

// Monday "time to pay out" reminder to the admins: what's still due for last week (Mon–Sun),
// and how many needs_review orders wait. Hourly on Mondays rather than once — Koyeb sleeps, so a
// single run could be missed. Claimed in bot_digests before sending, so it goes out once per
// week even across restarts; nothing due and nothing to review → claimed, nothing sent.
@Injectable()
export class PayoutReminderService {
  private readonly logger = new Logger(PayoutReminderService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourly(): Promise<void> {
    await this.run();
  }

  // Returns how many admins were messaged (null = not the time / already handled this week).
  async run(now: Date = new Date()): Promise<number | null> {
    const local = new Date(now.getTime() + BISHKEK_OFFSET_MS);
    const hour = local.getUTCHours();

    if (
      local.getUTCDay() !== 1 ||
      hour < PAYOUT_REMINDER_HOURS.from ||
      hour >= PAYOUT_REMINDER_HOURS.to
    ) {
      return null;
    }

    const lastWeekDay = new Date(local.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const period = await weekOf(this.dataSource, lastWeekDay);
    const [handled]: Array<{ id: number }> = await this.dataSource.query(
      `SELECT "id" FROM "bot_digests" WHERE "kind" = $1 AND "periodFrom" = $2::date`,
      [KIND, period.from],
    );

    if (handled) {
      return null;
    }

    const report = await buildPayoutReport(this.dataSource, period);
    const { progress, older } = await readOnly(this.dataSource, async (em) => ({
      progress: await payoutProgress(em, period),
      // Paid orders of earlier weeks still not paid out (a late webhook, a resolved
      // needs_review landing in a week already marked) — otherwise nobody would ever be told.
      older: await unpaidBefore(em, period.from),
    }));
    const due = report.rows
      .map((row) => ({
        merchantName: row.merchantName,
        due: progress.get(row.merchantId)?.due ?? row.payout,
      }))
      .filter((row) => row.due > 0);
    const nothing = due.length === 0 && older.length === 0 && report.needsReview.length === 0;

    // Claimed right before sending — not before the report (a failing query would lose the week).
    const [claimed]: Array<{ id: number }> = await this.dataSource.query(
      `INSERT INTO "bot_digests" ("kind", "periodFrom") VALUES ($1, $2::date)
       ON CONFLICT ON CONSTRAINT "bot_digests_kind_period" DO NOTHING RETURNING "id"`,
      [KIND, period.from],
    );

    if (!claimed) {
      return null; // an overlapping run got there first
    }

    if (nothing) {
      this.logger.log(`Payout reminder ${period.from}: nothing due, nothing to review`);

      return 0;
    }

    const admins: Array<{ telegramId: string; language: Language | null }> =
      await this.dataSource.query(
        `SELECT "telegramId"::text AS "telegramId", "language" FROM "users" WHERE "role" = 'admin'`,
      );
    let delivered = 0;

    for (const admin of admins) {
      const message = payoutReminderMessage(admin.language ?? "kg", {
        ...period,
        due,
        older,
        needsReviewCount: report.needsReview.length,
      });

      const sent = await this.bot.send({
        chatId: Number(admin.telegramId),
        html: message.html,
        button: { text: message.button, url: this.finik.redirectUrl },
      });

      delivered += sent ? 1 : 0;
    }

    // Nobody got it (Telegram down, no admin chat) → release the claim, the next hour retries.
    if (delivered === 0) {
      await this.dataSource.query(`DELETE FROM "bot_digests" WHERE "id" = $1`, [claimed.id]);
      this.logger.warn(`Payout reminder ${period.from}: not delivered to any admin, will retry`);

      return 0;
    }

    this.logger.log(
      `Payout reminder ${period.from}: ${due.length} merchant(s) due, ${older.length} with older debts, sent to ${delivered} admin(s)`,
    );

    return delivered;
  }
}
