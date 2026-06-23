import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike } from "typeorm";

import { Merchant } from "./entities/merchant.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  findAll(search?: string, category?: string): Promise<Merchant[]> {
    const where: Record<string, unknown> = { isActive: true };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.name = ILike(`%${search}%`);
    }

    return this.merchantRepo.find({ where });
  }

  async getCategories(): Promise<string[]> {
    const rows = await this.merchantRepo
      .createQueryBuilder("merchant")
      .select("DISTINCT merchant.category", "category")
      .where("merchant.isActive = true")
      .andWhere("merchant.category IS NOT NULL")
      .getRawMany<{ category: string }>();

    return rows.map((r) => r.category);
  }

  async findOne(id: number): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  create(dto: CreateMerchantDto): Promise<Merchant> {
    const merchant = this.merchantRepo.create(dto);
    return this.merchantRepo.save(merchant);
  }

  async update(
    id: number,
    dto: UpdateMerchantDto,
    user: CurrentUser,
  ): Promise<Merchant> {
    const merchant = await this.findOne(id);
    const isMerchant = merchant.merchantTelegramId === user.telegramId;

    if (!isMerchant && user.role !== "admin") {
      throw new ForbiddenException();
    }

    Object.assign(merchant, dto);
    return this.merchantRepo.save(merchant);
  }
}
