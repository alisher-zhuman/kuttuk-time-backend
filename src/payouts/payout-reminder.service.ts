import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { payoutProgress } from "./payout-ledger";
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
    const [claimed]: Array<{ id: number }> = await this.dataSource.query(
      `INSERT INTO "bot_digests" ("kind", "periodFrom") VALUES ($1, $2::date)
       ON CONFLICT ON CONSTRAINT "bot_digests_kind_period" DO NOTHING RETURNING "id"`,
      [KIND, period.from],
    );

    if (!claimed) {
      return null;
    }

    const report = await buildPayoutReport(this.dataSource, period);
    const progress = await readOnly(this.dataSource, (em) => payoutProgress(em, period));
    const due = report.rows
      .map((row) => ({
        merchantName: row.merchantName,
        due: progress.get(row.merchantId)?.due ?? row.payout,
      }))
      .filter((row) => row.due > 0);

    if (due.length === 0 && report.needsReview.length === 0) {
      this.logger.log(`Payout reminder ${period.from}: nothing due, nothing to review`);

      return 0;
    }

    const admins: Array<{ telegramId: string; language: Language | null }> =
      await this.dataSource.query(
        `SELECT "telegramId"::text AS "telegramId", "language" FROM "users" WHERE "role" = 'admin'`,
      );

    for (const admin of admins) {
      const message = payoutReminderMessage(admin.language ?? "kg", {
        ...period,
        due,
        needsReviewCount: report.needsReview.length,
      });

      await this.bot.send({
        chatId: Number(admin.telegramId),
        html: message.html,
        button: { text: message.button, url: this.finik.redirectUrl },
      });
    }

    this.logger.log(
      `Payout reminder ${period.from}: ${due.length} merchant(s) due, sent to ${admins.length} admin(s)`,
    );

    return admins.length;
  }
}
