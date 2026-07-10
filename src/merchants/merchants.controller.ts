import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from "@nestjs/swagger";

import { MerchantsService } from "./merchants.service";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };
const NOT_FOUND = { statusCode: 404, message: "Merchant not found", error: "Not Found" };

@ApiTags("Merchants")
@ApiBearerAuth()
@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({
    summary: "List active merchants",
    description: "**Roles:** user · merchant · admin",
  })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "category", required: false, example: 1 })
  @ApiOkResponse({
    description: "Array of merchants",
    schema: {
      example: [
        {
          id: 9,
          name: "Sierra Coffee",
          description: "Лучший кофе в городе",
          logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
          minNominal: 500,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  findAll(
    @Headers("accept-language") acceptLanguage: string = "kg",
    @Query("search") search?: string,
    @Query("category", new ParseIntPipe({ optional: true })) category?: number,
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.merchantsService.findAll(lang, search, category);
  }

  @Get(":idOrSlug")
  @ApiOperation({
    summary: "Get one merchant by ID or slug",
    description: "**Roles:** user · merchant · admin",
  })
  @ApiOkResponse({
    description: "Merchant object",
    schema: {
      example: {
        id: 9,
        name: "Sierra Coffee",
        description: "Лучший кофе в городе",
        logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
        nominals: [500, 1000, 2000],
        validityMonths: 12,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  findOne(
    @Param("idOrSlug") idOrSlug: string,
    @Headers("accept-language") acceptLanguage: string = "kg",
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.merchantsService.findOne(idOrSlug, lang);
  }

  @Patch("me")
  @UseGuards(RolesGuard)
  @Roles("merchant")
  @ApiOperation({
    summary: "Update own merchant profile",
    description: "**Roles:** `merchant` only. Edits the merchant tied to your own Telegram account.",
  })
  @ApiOkResponse({
    description: "Merchant updated",
    schema: {
      example: {
        id: 9,
        name: "Sierra Coffee",
        description: { kg: "...", ru: "Лучший кофе в городе", en: "Best coffee in the city" },
        categories: [1],
        nominals: [500, 1000, 2000],
        validityMonths: 12,
        merchantTelegramId: 123456789,
        logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
        slug: "sierra-coffee",
        isActive: true,
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-07-10T12:00:00.000Z",
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires merchant role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  updateOwn(@Body() dto: UpdateMerchantDto, @GetUser() user: CurrentUser) {
    return this.merchantsService.updateOwn(user.telegramId, dto);
  }
}
