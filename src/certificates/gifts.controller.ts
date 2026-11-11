import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { GiftsService } from "./gifts.service";
import { GetUser } from "@/auth/get-user.decorator";
import { requireTelegram } from "@/auth/require-telegram";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

// The token is the part after gift_ in startapp; a malformed one is just "not found".
@ApiTags("Gifts")
@ApiBearerAuth()
@Controller("gifts")
export class GiftsController {
  constructor(private readonly gifts: GiftsService) {}

  @Get(":token")
  @ApiOperation({
    summary: "A gift link: what it is and whether the caller can claim it",
    description:
      "**Roles:** any. `state`: `available` (can be claimed if `status` is `active`), `own` (the caller's own link), `received` (the caller already claimed it), `claimed` (someone else did). No code in the answer.",
  })
  @ApiOkResponse({
    schema: {
      example: {
        state: "available",
        status: "active",
        amount: 1000,
        validUntil: "2027-10-21T06:00:00.000Z",
        venue: { id: 9, name: "Sierra Coffee", slug: "sierra-coffee", logo: "https://…" },
      },
    },
  })
  @ApiNotFoundResponse({ description: "Unknown link, or replaced by a newer card" })
  preview(@Param("token") token: string, @GetUser() user: CurrentUser) {
    return this.gifts.preview(user.userId, token);
  }

  @Post(":token/claim")
  @HttpCode(200)
  @ApiOperation({
    summary: "Claim the gift: the certificate becomes the caller's",
    description:
      "**Roles:** any. Atomic - of two at once, one wins. Returns the certificate as in `GET /certificates/my`; a repeat by the same person → the same 200. The giver gets a bot message.",
  })
  @ApiNotFoundResponse({ description: "Unknown link, or replaced by a newer card" })
  @ApiConflictResponse({ description: "error: own | already_claimed | already_used | expired" })
  @ApiForbiddenResponse({
    description: "A website guest - error: telegram_required (log in first)",
  })
  claim(@Param("token") token: string, @GetUser() user: CurrentUser) {
    requireTelegram(user);

    return this.gifts.claim(user.userId, token);
  }
}
