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
  @ApiOkResponse({ description: "Array of merchants" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
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

  @Patch("me")
  @UseGuards(RolesGuard)
  @Roles("merchant")
  @ApiOperation({
    summary: "Update own merchant profile",
    description: "**Roles:** `merchant` only. Edits the merchant tied to your own Telegram account.",
  })
  @ApiOkResponse({ description: "Merchant updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires merchant role" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  updateOwn(@Body() dto: UpdateMerchantDto, @GetUser() user: CurrentUser) {
    return this.merchantsService.updateOwn(user.telegramId, dto);
  }
}
