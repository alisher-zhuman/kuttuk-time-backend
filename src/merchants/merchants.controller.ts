import { Controller, Get, Patch, Body, Param, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";

import { ParseIdPipe } from "@/common/pipes/parse-id.pipe";

import { MerchantsService } from "./merchants.service";
import { UpdateVenueDto } from "@/venues/dto/update-venue.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };

const OWN_VENUE_EXAMPLE = {
  id: 9,
  name: "Sierra Coffee",
  description: { kg: "...", ru: "Лучший кофе в городе", en: "Best coffee in the city" },
  categories: [1],
  nominals: [500, 1000, 2000],
  validityMonths: 12,
  logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
  slug: "sierra-coffee",
  isActive: true,
  createdAt: "2026-06-15T10:00:00.000Z",
};

// The owner's own business account. The cabinet (summary, certificates, redemption) lives in
// src/certificates/merchant-*.controller.ts under the same /merchants/me prefix.
@ApiTags("Merchant cabinet")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("merchant")
@Controller("merchants/me")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({
    summary: "Own merchant account and its venues",
    description:
      "**Roles:** `merchant` only. The account tied to your Telegram ID; `venues` — all of them, active or not.",
  })
  @ApiOkResponse({
    schema: {
      example: { id: 9, name: "Sierra Coffee", isActive: true, venues: [OWN_VENUE_EXAMPLE] },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires merchant role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "No merchant for this Telegram account" })
  getOwn(@GetUser() user: CurrentUser) {
    return this.merchantsService.getOwn(user.telegramId);
  }

  @Patch("venues/:venueId")
  @ApiOperation({
    summary: "Update own venue (storefront)",
    description:
      "**Roles:** `merchant` only. Not `slug` / `isActive` / the owner — those are admin-only.",
  })
  @ApiOkResponse({ schema: { example: OWN_VENUE_EXAMPLE } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({
    description: "Requires merchant role, or the merchant is deactivated",
    schema: { example: FORBIDDEN },
  })
  @ApiNotFoundResponse({ description: "No merchant, or the venue isn't yours" })
  updateOwnVenue(
    @Param("venueId", new ParseIdPipe()) venueId: number,
    @Body() dto: UpdateVenueDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.updateOwnVenue(user.telegramId, venueId, dto);
  }
}
