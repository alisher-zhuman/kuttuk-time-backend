import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { CertificatesService } from "./certificates.service";
import { GiftShareService } from "./gift-share.service";
import { toLanguage } from "@/common/translations";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@ApiTags("Certificates")
@ApiBearerAuth()
@Controller("certificates")
export class CertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly giftShare: GiftShareService,
  ) {}

  // Default rate limit (60/min), per user via UserThrottlerGuard.
  @Get("my")
  @ApiOperation({
    summary: "Own certificates",
    description:
      "**Roles:** any. Only certificates owned by the caller. `status` is effective: `active` past `validUntil` is returned as `expired`. `usedAt` is present only for `used`. Sorted: active first, then newest first.",
  })
  @ApiOkResponse({
    schema: {
      example: [
        {
          id: "0b6f7c3e-2a51-4c1e-9d3e-7d2f1b8a4c10",
          code: "04718263",
          amount: 1000,
          status: "active",
          validUntil: "2027-10-15T10:05:12.000Z",
          createdAt: "2026-10-15T10:05:12.000Z",
          venue: {
            id: 9,
            name: "Sierra Coffee",
            slug: "sierra-coffee",
            logo: "https://res.cloudinary.com/…/abc.webp",
          },
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  findMine(@GetUser() user: CurrentUser) {
    return this.certificatesService.findMine(user.userId);
  }

  @Post(":id/share")
  @HttpCode(200)
  @ApiOperation({
    summary: "Prepare a gift card to send to a friend (Telegram shareMessage)",
    description:
      '**Roles:** any — the certificate\'s owner. The server stores a ready card with Telegram (`savePreparedInlineMessage`: venue, amount, code, an "Open <venue>" button and a "Copy code" button, in the `Accept-Language` language) and returns its id; the Mini App calls `shareMessage(preparedMessageId)` and the user picks a chat. Ask for a new one per tap — it expires. Only an active certificate.',
  })
  @ApiOkResponse({
    schema: { example: { preparedMessageId: "aBcD123", expiresAt: "2026-10-22T12:00:00.000Z" } },
  })
  @ApiNotFoundResponse({ description: "No such certificate of yours" })
  @ApiConflictResponse({ description: "error: used | expired" })
  @ApiBadGatewayResponse({ description: "Telegram didn't store the card" })
  share(
    @Param("id", new ParseUUIDPipe()) id: string,
    @GetUser() user: CurrentUser,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.giftShare.prepare(
      user.userId,
      user.telegramId,
      id,
      toLanguage(acceptLanguage) ?? "kg",
    );
  }
}
