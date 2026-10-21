import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import { AdminPayoutsService } from "./admin-payouts.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Admin · Payouts")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/payouts")
export class AdminPayoutsController {
  constructor(private readonly payouts: AdminPayoutsService) {}

  @Get()
  @ApiOperation({
    summary: "Merchant payouts for a week (Mon–Sun, Asia/Bishkek)",
    description:
      "**Roles:** `admin` only. `week` = any date inside the week (YYYY-MM-DD), default — the current week. The same numbers as `npm run report:payouts` and the merchant cabinet: paid orders by paidAt, grouped by the sale-time owner, 90/10, floored on each merchant's total. `needsReviewCount` — the week's needs_review orders, not paid out until resolved.",
  })
  @ApiQuery({ name: "week", required: false, example: "2026-10-21" })
  @ApiOkResponse({
    schema: {
      example: {
        from: "2026-10-19",
        to: "2026-10-25",
        merchants: [
          {
            merchantId: 9,
            merchantName: "Sierra Coffee",
            ordersCount: 3,
            gross: 1500,
            commission: 150,
            payout: 1350,
          },
        ],
        total: { ordersCount: 3, gross: 1500, commission: 150, payout: 1350 },
        needsReviewCount: 1,
      },
    },
  })
  @ApiBadRequestResponse({ description: "week is not a date" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  week(@Query("week") week?: string) {
    return this.payouts.week(week);
  }
}
