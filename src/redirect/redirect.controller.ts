import { Controller, Get, NotFoundException, Param, Redirect } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";

import { Merchant } from "@/merchants/entities/merchant.entity";
import { Public } from "@/auth/public.decorator";

@ApiExcludeController()
@Controller()
export class RedirectController {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly config: ConfigService,
  ) {}

  @Get(":slug")
  @Public()
  @Redirect()
  async redirect(@Param("slug") slug: string) {
    const merchant = await this.merchantRepo.findOne({
      where: { slug, isActive: true },
    });

    if (!merchant) {
      throw new NotFoundException("Link not found");
    }

    const botUsername = this.config.get("TG_BOT_USERNAME");
    const appName = this.config.get("TG_APP_NAME");

    return {
      url: `https://t.me/${botUsername}/${appName}?startapp=${slug}`,
      statusCode: 302,
    };
  }
}
