import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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

import { ParseIdPipe } from "@/common/pipes/parse-id.pipe";

import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

const UNAUTHORIZED = { statusCode: 401, message: "Unauthorized", error: "Unauthorized" };
const FORBIDDEN = { statusCode: 403, message: "Forbidden", error: "Forbidden" };
const NOT_FOUND = { statusCode: 404, message: "Merchant not found", error: "Not Found" };
const TG_CONFLICT = {
  statusCode: 409,
  message: 'telegramId "123456789" is already in use',
  error: "Conflict",
};

const ACCOUNT_EXAMPLE = {
  id: 9,
  name: "Sierra Coffee",
  telegramId: 123456789,
  isActive: true,
  createdAt: "2026-06-15T10:00:00.000Z",
};

// Business accounts. Their storefronts are managed under /admin/venues.
@ApiTags("Admin · Merchants")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("admin")
@Controller("admin/merchants")
export class AdminMerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({ summary: "List merchant accounts", description: "**Roles:** `admin` only" })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "isActive", required: false, example: true })
  @ApiOkResponse({ schema: { example: [ACCOUNT_EXAMPLE] } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  findAll(
    @Query("search") search?: string,
    @Query("isActive", new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.merchantsService.findAllAdmin(search, isActive);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one merchant account with its venues",
    description: "**Roles:** `admin` only",
  })
  @ApiOkResponse({
    schema: {
      example: {
        ...ACCOUNT_EXAMPLE,
        venues: [
          {
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
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  findOne(@Param("id", new ParseIdPipe()) id: number) {
    return this.merchantsService.findOneAdmin(id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a merchant account",
    description:
      "**Roles:** `admin` only. Then add its venues with POST /admin/venues. The owner gets the merchant role on the next log-in.",
  })
  @ApiCreatedResponse({ schema: { example: ACCOUNT_EXAMPLE } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiConflictResponse({
    description: "telegramId already in use",
    schema: { example: TG_CONFLICT },
  })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update a merchant account",
    description:
      "**Roles:** `admin` only. `isActive: false` hides all its venues and blocks editing them; the cabinet and redemption keep working.",
  })
  @ApiOkResponse({ schema: { example: ACCOUNT_EXAMPLE } })
  @ApiUnauthorizedResponse({ description: "No token provided", schema: { example: UNAUTHORIZED } })
  @ApiForbiddenResponse({ description: "Requires admin role", schema: { example: FORBIDDEN } })
  @ApiNotFoundResponse({ description: "Merchant not found", schema: { example: NOT_FOUND } })
  @ApiConflictResponse({
    description: "telegramId already in use",
    schema: { example: TG_CONFLICT },
  })
  update(@Param("id", new ParseIdPipe()) id: number, @Body() dto: AdminUpdateMerchantDto) {
    return this.merchantsService.updateAdmin(id, dto);
  }
}
