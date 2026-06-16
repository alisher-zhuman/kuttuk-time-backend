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
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";

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
  @ApiOperation({ summary: "List all active merchants" })
  findAll() {
    return this.merchantsService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get merchant with certificates" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create merchant (admin only)" })
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update merchant (admin or owner)" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.update(id, dto, user);
  }

  @Get(":id/certificates")
  @ApiOperation({ summary: "List active certificates for a merchant" })
  findCertificates(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findCertificates(id);
  }

  @Post(":id/certificates")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create certificate (admin or owner)" })
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
  @ApiOperation({ summary: "Update certificate (admin or owner)" })
  updateCertificate(
    @Param("id", ParseIntPipe) id: number,
    @Param("certId", ParseIntPipe) certId: number,
    @Body() dto: UpdateCertificateDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.updateCertificate(id, certId, dto, user);
  }
}
