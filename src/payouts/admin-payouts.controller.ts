import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import { AdminPayoutsService } from "./admin-payouts.service";
import { MarkPaidOutDto } from "./dto/mark-paid-out.dto";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";
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
      "**Roles:** `admin` only. `week` = any date inside the week (YYYY-MM-DD), default — the current week. The same numbers as `npm run report:payouts` and the merchant cabinet: paid orders by paidAt, grouped by the sale-time owner, 90/10, floored on each merchant's total. `needsReviewCount` — the week's needs_review orders, not paid out until resolved. `paidOut` — recorded payouts for the week; `due` — the share of paid orders not covered by a payout yet (an order can land in a week after it was marked).",
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
            paidOut: 1350,
            due: 0,
          },
        ],
        total: {
          ordersCount: 3,
          gross: 1500,
          commission: 150,
          payout: 1350,
          paidOut: 1350,
          due: 0,
        },
        needsReviewCount: 1,
      },
    },
  })
  @ApiBadRequestResponse({ description: "week is not a date" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  week(@Query("week") week?: string) {
    return this.payouts.week(week);
  }

  @Post()
  @ApiOperation({
    summary: "Mark a merchant's week as paid out",
    description:
      "**Roles:** `admin` only. Call after transferring the money by hand. Covers the merchant's paid orders of that week not paid out yet; the amount is computed on the server (never sent by the client). The owner gets a bot message. Nothing left to pay → 409 `nothing_to_pay_out` (a double click can't pay twice). No undo.",
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: "6c1d…",
        merchantId: 10,
        from: "2026-10-19",
        to: "2026-10-25",
        ordersCount: 3,
        gross: 30,
        commission: 3,
        payout: 27,
        note: "Mbank transfer 27.10",
        paidBy: 4,
        createdAt: "2026-10-27T04:00:00.000Z",
      },
    },
  })
  @ApiBadRequestResponse({ description: "Bad body / week, or merchantId doesn't exist" })
  @ApiConflictResponse({ description: "error: nothing_to_pay_out" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  markPaidOut(@Body() dto: MarkPaidOutDto, @GetUser() user: CurrentUser) {
    return this.payouts.markPaidOut(dto, user.userId);
  }
}
