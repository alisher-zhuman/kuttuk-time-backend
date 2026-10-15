import { Controller, Get } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { CertificatesService } from "./certificates.service";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@ApiTags("Certificates")
@ApiBearerAuth()
@Controller("certificates")
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

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
          code: "KT-7F3A-9B2C",
          amount: 1000,
          status: "active",
          validUntil: "2027-10-15T10:05:12.000Z",
          createdAt: "2026-10-15T10:05:12.000Z",
          merchant: {
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
}
