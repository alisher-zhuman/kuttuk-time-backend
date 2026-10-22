import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
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

import { AdminOrdersService } from "./admin-orders.service";
import { OrderStatus } from "./entities/order.entity";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

const ITEM_EXAMPLE = {
  id: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
  amount: 1000,
  status: "paid",
  createdAt: "2026-10-21T04:25:00.000Z",
  paidAt: "2026-10-21T04:30:39.612Z",
  venue: { id: 10, name: "Coffeeroom" },
  merchant: { id: 10, name: "Coffeeroom" },
  certificateCode: "52930186",
};

// Read-only. Resolving needs_review (issue / refund) stays `npm run orders:resolve-review`.
@ApiTags("Admin · Orders")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: "Orders, newest first",
    description:
      "**Roles:** `admin` only. Keyset pagination: pass `nextCursor` back as `cursor`, `null` = last page. `search` = a certificate code (any case/spacing, like redemption) or an order id. `merchant` = the owner at the moment of the sale. `paidAt` / `certificateCode` only when set.",
  })
  @ApiQuery({ name: "status", required: false, enum: Object.values(OrderStatus) })
  @ApiQuery({ name: "venueId", required: false, example: 10 })
  @ApiQuery({ name: "merchantId", required: false, example: 10 })
  @ApiQuery({ name: "search", required: false, example: "52930186" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiQuery({ name: "cursor", required: false })
  @ApiOkResponse({ schema: { example: { items: [ITEM_EXAMPLE], nextCursor: null } } })
  @ApiBadRequestResponse({ description: "Bad status / limit / cursor / search" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  list(
    @Query("status") status?: string,
    @Query("venueId", new ParseIdPipe({ optional: true })) venueId?: number,
    @Query("merchantId", new ParseIdPipe({ optional: true })) merchantId?: number,
    @Query("search") search?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return this.orders.list({ status, venueId, merchantId, search, limit, cursor });
  }

  @Get(":id")
  @ApiOperation({
    summary: "One order with its certificate, buyer, Finik webhooks and manual resolutions",
    description:
      "**Roles:** `admin` only. `webhooks[].amount` is what Finik sent — for `needs_review`, compare it with `amount`. `certificate.status` is effective; `usedAt` only for `used`.",
  })
  @ApiOkResponse({
    schema: {
      example: {
        ...ITEM_EXAMPLE,
        expiresAt: "2026-10-21T04:55:00.000Z",
        finikTransactionId: "320259584_5e1c1f5b-…_DEBIT",
        buyer: { userId: 2, telegramId: 953745973 },
        certificate: {
          code: "52930186",
          status: "active",
          validUntil: "2027-10-21T04:30:39.612Z",
        },
        webhooks: [{ receivedAt: "2026-10-21T04:30:41.000Z", result: "paid", amount: 1000 }],
        resolutions: [],
      },
    },
  })
  @ApiBadRequestResponse({ description: "id is not a uuid" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Order not found" })
  detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.orders.detail(id);
  }
}
