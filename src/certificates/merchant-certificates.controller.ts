import { Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { RedemptionService } from "./redemption.service";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

const EXAMPLE = {
  code: "04718263",
  amount: 1000,
  status: "active",
  validUntil: "2027-10-20T10:05:12.000Z",
  createdAt: "2026-10-20T10:05:12.000Z",
  venue: { id: 9, name: "Sierra Coffee" },
};

// The merchant owner's certificates, by code. Default rate limit (60/min per user).
@ApiTags("Merchant cabinet")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("merchant")
@Controller("merchants/me/certificates")
export class MerchantCertificatesController {
  constructor(private readonly redemption: RedemptionService) {}

  @Get(":code")
  @ApiOperation({
    summary: "Look up own certificate by code (before redeeming)",
    description:
      "**Roles:** `merchant`. Any of your venues' certificates (`venue` says which). Code = 8 digits, spaces / dashes ignored (`0471 8263`). `status` is effective (`active` past `validUntil` → `expired`); `usedAt` only for `used`.",
  })
  @ApiOkResponse({ schema: { example: EXAMPLE } })
  @ApiBadRequestResponse({ description: "Not a certificate code" })
  @ApiForbiddenResponse({ description: "Not a merchant" })
  @ApiNotFoundResponse({ description: "No such certificate at your venues" })
  lookup(@Param("code") code: string, @GetUser() user: CurrentUser) {
    return this.redemption.lookup(user.telegramId, code);
  }

  @Post(":code/redeem")
  @HttpCode(200)
  @ApiOperation({
    summary: "Redeem own certificate (all-or-nothing, final)",
    description:
      "**Roles:** `merchant`. Atomic: only an `active`, unexpired certificate of one of your venues becomes `used`. 409 `error: already_used` / `expired` otherwise — re-fetch `GET` for details.",
  })
  @ApiOkResponse({
    schema: { example: { ...EXAMPLE, status: "used", usedAt: "2026-10-21T12:00:00.000Z" } },
  })
  @ApiBadRequestResponse({ description: "Not a certificate code" })
  @ApiForbiddenResponse({ description: "Not a merchant" })
  @ApiNotFoundResponse({ description: "No such certificate at your venues" })
  @ApiConflictResponse({ description: "error: already_used | expired" })
  redeem(@Param("code") code: string, @GetUser() user: CurrentUser) {
    return this.redemption.redeem(user.telegramId, code);
  }
}
