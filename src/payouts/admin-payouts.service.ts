import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import {
  buildPayoutReport,
  currentWeek,
  weekOf,
  type MerchantPayout,
  type PayoutPeriod,
  type PayoutReport,
} from "./payouts-report";

export interface AdminWeekPayouts {
  from: string;
  to: string;
  merchants: MerchantPayout[];
  total: PayoutReport["total"];
  // needs_review orders of the week — not in `merchants`, resolve them before paying out.
  needsReviewCount: number;
}

// The payout report as JSON: the same buildPayoutReport() as `npm run report:payouts` (and
// paidSales() underneath, as the merchant cabinet), so the screen, the CSV and the cabinet
// can't disagree. Read-only.
@Injectable()
export class AdminPayoutsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async week(week?: string): Promise<AdminWeekPayouts> {
    let period: PayoutPeriod;

    try {
      period = week ? await weekOf(this.dataSource, week) : await currentWeek(this.dataSource);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid week");
    }

    const report = await buildPayoutReport(this.dataSource, period);

    return {
      from: report.period.from,
      to: report.period.to,
      merchants: report.rows,
      total: report.total,
      needsReviewCount: report.needsReview.length,
    };
  }
}
