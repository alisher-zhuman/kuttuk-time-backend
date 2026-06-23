import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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
} from "@nestjs/swagger";

import { MerchantsService } from "./merchants.service";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";
import { JwtGuard } from "@/auth/jwt.guard";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { GetUser } from "@/auth/get-user.decorator";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@ApiTags("Merchants")
@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @ApiOperation({
    summary: "List all active merchants",
    description: "**Roles:** public (no token required)",
  })
  @ApiOkResponse({ description: "Array of merchants" })
  findAll() {
    return this.merchantsService.findAll();
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one merchant with their certificates",
    description: "**Roles:** public (no token required)",
  })
  @ApiOkResponse({ description: "Merchant object with certificates" })
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
    description:
      "**Roles:** `admin` (any merchant) · `merchant` (own profile only)",
  })
  @ApiOkResponse({ description: "Merchant updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin or merchant role, or not your profile" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.update(id, dto, user);
  }

  @Get(":id/certificates")
  @ApiOperation({
    summary: "List active certificates for a merchant",
    description: "**Roles:** public (no token required)",
  })
  @ApiOkResponse({ description: "Array of certificates" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  findCertificates(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findCertificates(id);
  }

  @Post(":id/certificates")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a certificate for a merchant",
    description:
      "**Roles:** `admin` (any merchant) · `merchant` (own profile only)",
  })
  @ApiCreatedResponse({ description: "Certificate created" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin or merchant role, or not your profile" })
  @ApiNotFoundResponse({ description: "Merchant not found" })
  createCertificate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateCertificateDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.createCertificate(id, dto, user);
  }

  @Patch(":id/certificates/:certId")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update a certificate",
    description:
      "**Roles:** `admin` (any merchant) · `merchant` (own profile only)",
  })
  @ApiOkResponse({ description: "Certificate updated" })
  @ApiUnauthorizedResponse({ description: "No token provided" })
  @ApiForbiddenResponse({ description: "Requires admin or merchant role, or not your profile" })
  @ApiNotFoundResponse({ description: "Certificate not found" })
  updateCertificate(
    @Param("id", ParseIntPipe) id: number,
    @Param("certId", ParseIntPipe) certId: number,
    @Body() dto: UpdateCertificateDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.updateCertificate(id, certId, dto, user);
  }
}
