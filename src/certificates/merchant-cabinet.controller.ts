import { Controller, Get, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

import { ParseIdPipe } from "@/common/pipes/parse-id.pipe";

import { MerchantCabinetService } from "./merchant-cabinet.service";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

// The merchant owner's cabinet: weekly summary and the list of certificates — for the whole
// merchant (all its venues: payouts are per merchant), optionally narrowed with ?venueId=.
// Lookup/redeem by code live in MerchantCertificatesController. Default rate limit, per user.
@ApiTags("Merchant cabinet")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("merchant")
@Controller("merchants/me")
export class MerchantCabinetController {
  constructor(private readonly cabinet: MerchantCabinetService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Weekly summary (Mon–Sun, Asia/Bishkek)",
    description:
      "**Roles:** `merchant`. `week` = any date inside the week (YYYY-MM-DD), default — the current week. Sold/payout use the same rules as the payout report (paid orders by paidAt, 90/10, floored on the total); redeemed = certificates used in that week. `paidOut` / `due` — recorded payouts and what's still owed for the week, whole merchant only (absent with `venueId`).",
  })
  @ApiQuery({ name: "week", required: false, example: "2026-10-20" })
  @ApiQuery({ name: "venueId", required: false, example: 9, description: "One of your venues" })
  @ApiOkResponse({
    schema: {
      example: {
        from: "2026-10-19",
        to: "2026-10-25",
        sold: { count: 3, amount: 1500 },
        commission: 150,
        payout: 1350,
        redeemed: { count: 1, amount: 500 },
        paidOut: 1350,
        due: 0,
      },
    },
  })
  @ApiBadRequestResponse({ description: "week is not a date" })
  @ApiForbiddenResponse({ description: "Not a merchant" })
  @ApiNotFoundResponse({ description: "venueId isn't one of your venues" })
  summary(
    @GetUser() user: CurrentUser,
    @Query("week") week?: string,
    @Query("venueId", new ParseIdPipe({ optional: true })) venueId?: number,
  ) {
    return this.cabinet.summary(user.telegramId, { week, venueId });
  }

  @Get("certificates")
  @ApiOperation({
    summary: "Own certificates, newest first",
    description:
      "**Roles:** `merchant`. Certificates of all your venues; optional `venueId`, `status` (effective: active | used | expired). Keyset pagination: pass `nextCursor` back as `cursor`; `null` = last page. `usedAt` only for `used`.",
  })
  @ApiQuery({ name: "status", required: false, enum: ["active", "used", "expired"] })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "venueId", required: false, example: 9, description: "One of your venues" })
  @ApiOkResponse({
    schema: {
      example: {
        items: [
          {
            code: "04718263",
            amount: 1000,
            status: "active",
            validUntil: "2027-10-20T10:05:12.000Z",
            createdAt: "2026-10-20T10:05:12.000Z",
            venue: { id: 9, name: "Sierra Coffee" },
          },
        ],
        nextCursor: null,
      },
    },
  })
  @ApiBadRequestResponse({ description: "Bad status / limit / cursor" })
  @ApiForbiddenResponse({ description: "Not a merchant" })
  @ApiNotFoundResponse({ description: "venueId isn't one of your venues" })
  list(
    @GetUser() user: CurrentUser,
    @Query("status") status?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("cursor") cursor?: string,
    @Query("venueId", new ParseIdPipe({ optional: true })) venueId?: number,
  ) {
    return this.cabinet.list(user.telegramId, { status, limit, cursor, venueId });
  }
}
