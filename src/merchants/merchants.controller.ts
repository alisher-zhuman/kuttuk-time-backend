import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Headers,
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
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

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
  @ApiQuery({ name: "category", required: false, example: "coffee" })
  @ApiOkResponse({ description: "Array of merchants" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  findAll(
    @Headers("accept-language") acceptLanguage: string = "kg",
    @Query("search") search?: string,
    @Query("category") category?: string,
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.merchantsService.findAll(lang, search, category);
  }

  @Get(":idOrSlug")
  @ApiOperation({
    summary: "Get one merchant by ID or slug",
    description: "**Roles:** user · merchant · admin",
  })
  @ApiOkResponse({ description: "Merchant object" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  findOne(
    @Param("idOrSlug") idOrSlug: string,
    @Headers("accept-language") acceptLanguage: string = "kg",
  ) {
    const lang = (acceptLanguage ?? "kg").slice(0, 2);
    return this.merchantsService.findOne(idOrSlug, lang);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin")
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
  @UseGuards(RolesGuard)
  @Roles("admin", "merchant")
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
