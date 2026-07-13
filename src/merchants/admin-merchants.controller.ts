import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  ParseBoolPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
} from "@nestjs/swagger";

import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };
const NOT_FOUND = { statusCode: 404, message: "Merchant not found", error: "Not Found" };
const SLUG_CONFLICT = {
  statusCode: 409,
  message: 'slug "sierra-coffee" is already in use',
  error: "Conflict",
};

const FULL_MERCHANT_EXAMPLE = {
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
};

// Same shape as above, minus `updatedAt` — matches findOneAdmin()'s Omit<Merchant, "updatedAt">
const MERCHANT_DETAIL_EXAMPLE = {
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
};

@ApiTags("Admin · Merchants")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/merchants")
export class AdminMerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({
    summary: "List all merchants",
    description: "**Roles:** `admin` only. Includes inactive merchants.",
  })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "category", required: false, example: 1 })
  @ApiQuery({ name: "isActive", required: false, example: true })
  @ApiOkResponse({
    description: "Array of merchants",
    schema: {
      example: [
        {
          id: 9,
          name: "Sierra Coffee",
          logo: "https://res.cloudinary.com/dnx8vxdyf/image/upload/v1/kuttuk-time/abc.webp",
          isActive: true,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  findAll(
    @Query("search") search?: string,
    @Query("category", new ParseIntPipe({ optional: true })) category?: number,
    @Query("isActive", new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.merchantsService.findAllAdmin(search, category, isActive);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one merchant (detail/edit view)",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({
    description: "Merchant object",
    schema: { example: MERCHANT_DETAIL_EXAMPLE },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findOneAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a merchant", description: "**Roles:** `admin` only" })
  @ApiCreatedResponse({
    description: "Merchant created",
    schema: { example: FULL_MERCHANT_EXAMPLE },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiConflictResponse({
    description: "slug or merchantTelegramId already in use",
    schema: { example: SLUG_CONFLICT },
  })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update any merchant", description: "**Roles:** `admin` only" })
  @ApiOkResponse({ description: "Merchant updated", schema: { example: FULL_MERCHANT_EXAMPLE } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  @ApiConflictResponse({
    description: "slug or merchantTelegramId already in use",
    schema: { example: SLUG_CONFLICT },
  })
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: AdminUpdateMerchantDto) {
    return this.merchantsService.updateAdmin(id, dto);
  }
}
