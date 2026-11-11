import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
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
      "**Roles:** any. Certificates owned by the caller, plus the ones they gave away and someone claimed (`giftedAt`). `status` is effective: `active` past `validUntil` is returned as `expired`. `usedAt` is present only for `used`. Sorted: own active first, then newest first.",
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
      '**Roles:** any - the certificate\'s owner. The server stores a ready card with Telegram (`savePreparedInlineMessage`: the QR, venue, amount, code, a "Claim gift" button (`startapp=gift_<token>`, see `/gifts`) and a "Copy code" button, in the `Accept-Language` language) and returns its id; the Mini App calls `shareMessage(preparedMessageId)` and the user picks a private chat. Ask for a new one per tap - it expires; a new card replaces the previous unclaimed link. Only an active certificate.',
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
    // A Telegram card is sent from the giver's Telegram account - a website guest gives a link
    // instead (docs/web-version.md, stage 2).
    if (user.telegramId === null) {
      throw new BadRequestException({
        message: "Gift cards need Telegram - share a gift link instead",
        error: "telegram_required",
      });
    }

    return this.giftShare.prepare(
      user.userId,
      user.telegramId,
      id,
      toLanguage(acceptLanguage) ?? "kg",
    );
  }

  @Post(":id/gift-link")
  @HttpCode(200)
  @ApiOperation({
    summary: "A gift link for the website's «Подарить» (shared via the phone's share menu)",
    description:
      "**Roles:** any - the certificate's owner, a website guest too. Returns `{ url }` - `<website>/gift/<token>`; the friend opens it, sees the gift and can claim it (`/gifts/:token`). A new link replaces the previous unclaimed one (Telegram card included). Only an active certificate.",
  })
  @ApiOkResponse({ schema: { example: { url: "https://kuttuk-time.vercel.app/gift/Abc…" } } })
  @ApiNotFoundResponse({ description: "No such certificate of yours" })
  @ApiConflictResponse({ description: "error: already_used | expired" })
  giftLink(@Param("id", new ParseUUIDPipe()) id: string, @GetUser() user: CurrentUser) {
    return this.giftShare.link(user.userId, id);
  }
}
