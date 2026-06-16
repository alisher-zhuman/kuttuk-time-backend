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

@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  findAll() {
    return this.merchantsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin")
  create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.update(id, dto, user);
  }

  @Get(":id/certificates")
  findCertificates(@Param("id", ParseIntPipe) id: number) {
    return this.merchantsService.findCertificates(id);
  }

  @Post(":id/certificates")
  @UseGuards(JwtGuard, RolesGuard)
  @Roles("admin", "merchant")
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
  updateCertificate(
    @Param("id", ParseIntPipe) id: number,
    @Param("certId", ParseIntPipe) certId: number,
    @Body() dto: UpdateCertificateDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.merchantsService.updateCertificate(id, certId, dto, user);
  }
}
