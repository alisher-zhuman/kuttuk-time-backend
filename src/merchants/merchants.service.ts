import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Merchant } from "./entities/merchant.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { CurrentUser } from "@/auth/interfaces/current-user.interface";
import { CloudinaryService } from "@/cloudinary/cloudinary.service";

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
    category?: string,
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
      .select(["merchant.id", "merchant.name", "merchant.description", "merchant.logo", "merchant.nominals"])
      .where("merchant.isActive = true");

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
      description: this.resolveDescription(description, lang),
      logo,
      minNominal: Math.min(...nominals),
    }));
  }

  async findOne(
    id: number,
    lang: string,
  ): Promise<{
    id: number;
    name: string;
    description: string | null;
    logo: string;
    nominals: number[];
    validityMonths: number;
  }> {
    const merchant = await this.merchantRepo.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return {
      id: merchant.id,
      name: merchant.name,
      description: this.resolveDescription(merchant.description, lang),
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

  async update(
    id: number,
    dto: UpdateMerchantDto,
    user: CurrentUser,
  ): Promise<Merchant> {
    const merchant = await this.findEntity(id);
    const isMerchant = merchant.merchantTelegramId === user.telegramId;

    if (!isMerchant && user.role !== "admin") {
      throw new ForbiddenException();
    }

    if (dto.logo && merchant.logo && merchant.logo !== dto.logo) {
      const publicId = this.extractCloudinaryPublicId(merchant.logo);

      if (publicId) {
        await this.cloudinaryService.deleteFile(publicId);
      }
    }

    Object.assign(merchant, dto);

    const saved = await this.merchantRepo.save(merchant);

    this.logger.log(`Merchant updated: id=${id}`);

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

  private resolveDescription(
    description: Record<string, string> | null,
    lang: string,
  ): string | null {
    if (!description) {
      return null;
    }

    return (
      description[lang] ??
      description["kg"] ??
      description["ru"] ??
      description["en"] ??
      null
    );
  }
}
