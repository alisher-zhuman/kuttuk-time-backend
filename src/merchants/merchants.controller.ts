import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from "@nestjs/swagger";

import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { JwtGuard } from "@/auth/jwt.guard";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@ApiTags("Merchants")
@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get("categories")
  @ApiOperation({
    summary: "List all available categories",
    description: "**Roles:** all",
  })
  @ApiOkResponse({
    description: "Array of category strings",
    schema: { example: ["coffee", "restaurant", "spa", "fitness"] },
  })
  getCategories() {
    return this.merchantsService.getCategories();
  }

  @Get()
  @ApiOperation({
    summary: "List active merchants",
    description: "**Roles:** all",
  })
  @ApiQuery({ name: "search", required: false, example: "sierra" })
  @ApiQuery({ name: "category", required: false, example: "coffee" })
  @ApiOkResponse({ description: "Array of merchants" })
  findAll(
    @Query("search") search?: string,
    @Query("category") category?: string,
  ) {
    return this.merchantsService.findAll(search, category);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one merchant",
    description: "**Roles:** all",
  })
  @ApiOkResponse({ description: "Merchant object" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a merchant",
    description: "**Roles:** `admin` only",
  })
  @ApiCreatedResponse({ description: "Merchant created" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin role" })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update a merchant",
    description: "**Roles:** `admin` (any) · `merchant` (own only)",
  })
  @ApiOkResponse({ description: "Merchant updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin or merchant role" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.update(id, dto, user);
  }
}
