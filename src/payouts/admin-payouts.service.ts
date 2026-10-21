import { BadRequestException, ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import type { MarkPaidOutDto } from "./dto/mark-paid-out.dto";
import { markPaidOut, NothingToPayOutError, payoutProgress } from "./payout-ledger";
import { payoutMessage } from "./payout-messages";
import {
  buildPayoutReport,
  currentWeek,
  readOnly,
  weekOf,
  type MerchantPayout,
  type PayoutPeriod,
  type PayoutReport,
} from "./payouts-report";
import type { Language } from "@/common/translations";
import { finikConfig } from "@/finik/finik.config";
import { TelegramBotService } from "@/telegram/telegram-bot.service";

type Progress = { paidOut: number; due: number };

export interface AdminWeekPayouts {
  from: string;
  to: string;
  merchants: Array<MerchantPayout & Progress>;
  total: PayoutReport["total"] & Progress;
  // needs_review orders of the week — not in `merchants`, resolve them before paying out.
  needsReviewCount: number;
}

export interface RecordedPayout {
  id: string;
  merchantId: number;
  from: string;
  to: string;
  ordersCount: number;
  gross: number;
  commission: number;
  payout: number;
  note?: string;
  paidBy: number;
  createdAt: Date;
}

// The payout report as JSON: the same buildPayoutReport() as `npm run report:payouts` (and
// paidSales() underneath, as the merchant cabinet), so the screen, the CSV and the cabinet
// can't disagree — plus what's already been paid out (payouts) and what's still due.
@Injectable()
export class AdminPayoutsService {
  private readonly logger = new Logger(AdminPayoutsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  async week(week?: string): Promise<AdminWeekPayouts> {
    const period = await this.period(week);
    const report = await buildPayoutReport(this.dataSource, period);
    const progress = await readOnly(this.dataSource, (em) => payoutProgress(em, period));
    const merchants = report.rows.map((row) => ({
      ...row,
      ...(progress.get(row.merchantId) ?? { paidOut: 0, due: 0 }),
    }));

    return {
      from: report.period.from,
      to: report.period.to,
      merchants,
      total: {
        ...report.total,
        paidOut: merchants.reduce((sum, row) => sum + row.paidOut, 0),
        due: merchants.reduce((sum, row) => sum + row.due, 0),
      },
      needsReviewCount: report.needsReview.length,
    };
  }

  // After the admin paid the merchant by hand: record it for the merchant's not-yet-paid-out
  // orders of that week, then tell the owner in the bot (best-effort, not awaited).
  async markPaidOut(dto: MarkPaidOutDto, adminUserId: number): Promise<RecordedPayout> {
    const period = await this.period(dto.week);
    const [merchant]: Array<{ id: number }> = await this.dataSource.query(
      `SELECT "id" FROM "merchants" WHERE "id" = $1`,
      [dto.merchantId],
    );

    if (!merchant) {
      throw new BadRequestException("Merchant not found");
    }

    try {
      const payout = await markPaidOut(this.dataSource, {
        merchantId: dto.merchantId,
        period,
        note: dto.note,
        paidBy: adminUserId,
      });

      this.logger.log(
        `Payout ${payout.id}: merchant ${payout.merchantId} ${payout.periodFrom}–${payout.periodTo} ${payout.payout} KGS (${payout.ordersCount} orders) by user ${adminUserId}`,
      );

      void this.notifyOwner(payout.id);

      return {
        id: payout.id,
        merchantId: payout.merchantId,
        from: payout.periodFrom,
        to: payout.periodTo,
        ordersCount: payout.ordersCount,
        gross: payout.gross,
        commission: payout.commission,
        payout: payout.payout,
        ...(payout.note ? { note: payout.note } : {}),
        paidBy: payout.paidBy,
        createdAt: payout.createdAt,
      };
    } catch (error) {
      if (error instanceof NothingToPayOutError) {
        throw new ConflictException({ message: error.message, error: "nothing_to_pay_out" });
      }

      throw error;
    }
  }

  private async period(week?: string): Promise<PayoutPeriod> {
    try {
      return week ? await weekOf(this.dataSource, week) : await currentWeek(this.dataSource);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid week");
    }
  }

  private async notifyOwner(payoutId: string): Promise<void> {
    try {
      const [row]: Array<{
        telegramId: string;
        language: Language | null;
        periodFrom: string;
        periodTo: string;
        ordersCount: number;
        gross: number;
        commission: number;
        payout: number;
      }> = await this.dataSource.query(
        `SELECT m."telegramId"::text AS "telegramId", u."language",
                to_char(p."periodFrom", 'YYYY-MM-DD') AS "periodFrom",
                to_char(p."periodTo", 'YYYY-MM-DD') AS "periodTo",
                p."ordersCount", p."gross", p."commission", p."payout"
           FROM "payouts" p
           JOIN "merchants" m ON m."id" = p."merchantId"
           LEFT JOIN "users" u ON u."telegramId" = m."telegramId"
          WHERE p."id" = $1`,
        [payoutId],
      );

      if (!row) {
        return;
      }

      const message = payoutMessage(row.language ?? "kg", row);

      await this.bot.send({
        chatId: Number(row.telegramId),
        html: message.html,
        button: { text: message.button, url: this.finik.redirectUrl },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Payout notification ${payoutId} failed: ${reason}`);
    }
  }
}
