import { Controller, Get, NotFoundException, Param, Redirect } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiExcludeController } from "@nestjs/swagger";

import { Merchant } from "@/merchants/entities/merchant.entity";
import { Public } from "@/auth/public.decorator";

@ApiExcludeController()
@Controller()
export class RedirectController {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
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

    return {
      url: `https://t.me/kuttuk_time_bot/app?startapp=${slug}`,
      statusCode: 302,
    };
  }
}
