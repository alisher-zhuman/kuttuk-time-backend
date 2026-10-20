import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@ApiTags("Orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  // Per user (UserThrottlerGuard), not per proxy IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: "Create an order and a Finik payment",
    description:
      "**Roles:** user · merchant · admin. The amount is taken from the venue's nominals.",
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        orderId: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
        paymentUrl: "https://...",
        expiresAt: "2026-10-12T10:30:00.000Z",
      },
    },
  })
  @ApiBadRequestResponse({ description: "Venue unavailable or nominal not offered" })
  @ApiBadGatewayResponse({ description: "Payment provider failed; the order is expired" })
  @ApiTooManyRequestsResponse({ description: "Too many order attempts" })
  create(@Body() dto: CreateOrderDto, @GetUser() user: CurrentUser) {
    return this.ordersService.create(user.userId, dto);
  }

  @Get(":id")
  // The frontend polls every 3 s while waiting for payment (20/min) — 60/min per user leaves headroom.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: "Get own order (polling after payment)",
    description: "**Roles:** any. Other users' orders return 404.",
  })
  @ApiOkResponse({
    schema: {
      example: {
        orderId: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
        status: "paid",
        amount: 1000,
        venueId: 9,
        paymentUrl: null,
        expiresAt: "2026-10-12T10:30:00.000Z",
        paidAt: "2026-10-12T10:05:12.000Z",
        certificate: { code: "KT-7F3A-9B2C", validUntil: "2027-10-12T10:05:12.000Z" },
      },
    },
  })
  @ApiNotFoundResponse({ description: "Order not found or not yours" })
  @ApiTooManyRequestsResponse({ description: "More than 60 requests per minute" })
  findOne(@Param("id", new ParseUUIDPipe()) id: string, @GetUser() user: CurrentUser) {
    return this.ordersService.findOwn(user.userId, id);
  }
}
