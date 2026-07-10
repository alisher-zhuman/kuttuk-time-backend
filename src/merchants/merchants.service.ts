import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Merchant } from "./entities/merchant.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { CloudinaryService } from "@/cloudinary/cloudinary.service";
import { resolveTranslation } from "@/common/utils/resolve-translation";

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll(
    lang: string,
    search?: string,
    category?: number,
  ): Promise<
    {
      id: number;
      name: string;
      description: string | null;
      logo: string;
      minNominal: number;
    }[]
  > {
    const qb = this.merchantRepo
      .createQueryBuilder("merchant")
      .select([
        "merchant.id",
        "merchant.name",
        "merchant.description",
        "merchant.logo",
        "merchant.nominals",
      ])
      .where("merchant.isActive = true")
      .orderBy("merchant.id", "ASC");

    if (category) {
      qb.andWhere(":category = ANY(merchant.categories)", { category });
    }

    if (search) {
      qb.andWhere("merchant.name ILIKE :search", { search: `%${search}%` });
    }

    const merchants = await qb.getMany();

    return merchants.map(({ id, name, description, logo, nominals }) => ({
      id,
      name,
      description: resolveTranslation(description, lang),
      logo,
      minNominal: Math.min(...nominals),
    }));
  }

  async findAllAdmin(
    search?: string,
    category?: number,
    isActive?: boolean,
  ): Promise<
    {
      id: number;
      name: string;
      logo: string;
      isActive: boolean;
    }[]
  > {
    const qb = this.merchantRepo
      .createQueryBuilder("merchant")
      .select(["merchant.id", "merchant.name", "merchant.logo", "merchant.isActive"])
      .orderBy("merchant.id", "ASC");

    if (isActive !== undefined) {
      qb.andWhere("merchant.isActive = :isActive", { isActive });
    }

    if (category) {
      qb.andWhere(":category = ANY(merchant.categories)", { category });
    }

    if (search) {
      qb.andWhere("merchant.name ILIKE :search", { search: `%${search}%` });
    }

    return qb.getMany();
  }

  private readonly detailSelect = [
    "merchant.id",
    "merchant.name",
    "merchant.description",
    "merchant.categories",
    "merchant.nominals",
    "merchant.validityMonths",
    "merchant.merchantTelegramId",
    "merchant.logo",
    "merchant.slug",
    "merchant.isActive",
    "merchant.createdAt",
  ];

  async findOneAdmin(id: number): Promise<Omit<Merchant, "updatedAt">> {
    const merchant = await this.merchantRepo
      .createQueryBuilder("merchant")
      .select(this.detailSelect)
      .where("merchant.id = :id", { id })
      .getOne();

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  async getOwn(telegramId: number): Promise<Omit<Merchant, "updatedAt">> {
    const merchant = await this.merchantRepo
      .createQueryBuilder("merchant")
      .select(this.detailSelect)
      .where("merchant.merchantTelegramId = :telegramId", { telegramId })
      .getOne();

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  async findOne(
    idOrSlug: string,
    lang: string,
  ): Promise<{
    id: number;
    name: string;
    description: string | null;
    logo: string;
    nominals: number[];
    validityMonths: number;
  }> {
    const numericId = Number(idOrSlug);
    const where = isNaN(numericId) ? { slug: idOrSlug } : { id: numericId };

    const merchant = await this.merchantRepo.findOne({ where });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return {
      id: merchant.id,
      name: merchant.name,
      description: resolveTranslation(merchant.description, lang),
      logo: merchant.logo,
      nominals: merchant.nominals,
      validityMonths: merchant.validityMonths,
    };
  }

  async create(dto: CreateMerchantDto): Promise<Merchant> {
    const merchant = this.merchantRepo.create(dto);
    const saved = await this.merchantRepo.save(merchant);

    this.logger.log(`Merchant created: id=${saved.id} name="${saved.name}"`);

    return saved;
  }

  async updateOwn(telegramId: number, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { merchantTelegramId: telegramId } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return this.applyUpdate(merchant, dto);
  }

  async updateAdmin(id: number, dto: AdminUpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.findEntity(id);
    return this.applyUpdate(merchant, dto);
  }

  private async applyUpdate(
    merchant: Merchant,
    dto: UpdateMerchantDto | AdminUpdateMerchantDto,
  ): Promise<Merchant> {
    if (dto.logo && merchant.logo && merchant.logo !== dto.logo) {
      const publicId = this.extractCloudinaryPublicId(merchant.logo);

      if (publicId) {
        await this.cloudinaryService.deleteFile(publicId);
      }
    }

    Object.assign(merchant, dto);

    const saved = await this.merchantRepo.save(merchant);

    this.logger.log(`Merchant updated: id=${merchant.id}`);

    return saved;
  }

  private async findEntity(id: number): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  private extractCloudinaryPublicId(url: string): string | null {
    const match = url.match(/\/upload\/v\d+\/(.+)\.[a-z]+$/);
    return match ? match[1] : null;
  }
}
