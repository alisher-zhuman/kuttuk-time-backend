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
  ApiQuery,
} from "@nestjs/swagger";

import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

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
  @ApiOkResponse({ description: "Array of merchants" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  findAll(
    @Query("search") search?: string,
    @Query("category", new ParseIntPipe({ optional: true })) category?: number,
    @Query("isActive", new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.merchantsService.findAllAdmin(search, category, isActive);
  }

  @Post()
  @ApiOperation({ summary: "Create a merchant", description: "**Roles:** `admin` only" })
  @ApiCreatedResponse({ description: "Merchant created" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update any merchant", description: "**Roles:** `admin` only" })
  @ApiOkResponse({ description: "Merchant updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: AdminUpdateMerchantDto) {
    return this.merchantsService.updateAdmin(id, dto);
  }
}
