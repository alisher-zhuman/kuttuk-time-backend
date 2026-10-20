import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Merchant } from "./entities/merchant.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { UpdateVenueDto } from "@/venues/dto/update-venue.dto";
import { definedFields } from "@/common/utils/defined-fields";
import { VenuesService, type VenueDetail } from "@/venues/venues.service";

type MerchantAccount = Pick<Merchant, "id" | "name" | "telegramId" | "isActive" | "createdAt">;

const toAccount = ({ id, name, telegramId, isActive, createdAt }: Merchant): MerchantAccount => ({
  id,
  name,
  telegramId,
  isActive,
  createdAt,
});

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly venuesService: VenuesService,
  ) {}

  async getOwn(
    telegramId: number,
  ): Promise<{ id: number; name: string; isActive: boolean; venues: VenueDetail[] }> {
    const merchant = await this.findByTelegramId(telegramId);

    return {
      id: merchant.id,
      name: merchant.name,
      isActive: merchant.isActive,
      venues: await this.venuesService.listForMerchant(merchant.id),
    };
  }

  async updateOwnVenue(
    telegramId: number,
    venueId: number,
    dto: UpdateVenueDto,
  ): Promise<VenueDetail> {
    const merchant = await this.findByTelegramId(telegramId);

    // GET /me still works so the frontend can show a "deactivated" notice
    if (!merchant.isActive) {
      throw new ForbiddenException("Merchant is deactivated");
    }

    return this.venuesService.updateOwn(merchant.id, venueId, dto);
  }

  async findAllAdmin(search?: string, isActive?: boolean): Promise<MerchantAccount[]> {
    const qb = this.merchantRepo.createQueryBuilder("merchant").orderBy("merchant.id", "ASC");

    if (isActive !== undefined) {
      qb.andWhere("merchant.isActive = :isActive", { isActive });
    }

    if (search) {
      qb.andWhere("merchant.name ILIKE :search", { search: `%${search}%` });
    }

    return (await qb.getMany()).map(toAccount);
  }

  async findOneAdmin(id: number): Promise<MerchantAccount & { venues: VenueDetail[] }> {
    const merchant = await this.findEntity(id);

    return { ...toAccount(merchant), venues: await this.venuesService.listForMerchant(id) };
  }

  async create(dto: CreateMerchantDto): Promise<MerchantAccount> {
    const saved = await this.merchantRepo.save(this.merchantRepo.create(dto));

    this.logger.log(`Merchant created: id=${saved.id} name="${saved.name}"`);

    return toAccount(saved);
  }

  async updateAdmin(id: number, dto: AdminUpdateMerchantDto): Promise<MerchantAccount> {
    const merchant = await this.findEntity(id);

    Object.assign(merchant, definedFields(dto));

    const saved = await this.merchantRepo.save(merchant);

    this.logger.log(`Merchant updated: id=${id}`);

    return toAccount(saved);
  }

  private async findByTelegramId(telegramId: number): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { telegramId } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }

  private async findEntity(id: number): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return merchant;
  }
}
