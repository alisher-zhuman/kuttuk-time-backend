import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Merchant } from "./entities/merchant.entity";
import { User } from "@/users/entities/user.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { AdminUpdateMerchantDto } from "./dto/admin-update-merchant.dto";
import { UpdateVenueDto } from "@/venues/dto/update-venue.dto";
import { definedFields } from "@/common/utils/defined-fields";
import { VenuesService, type VenueDetail } from "@/venues/venues.service";

// owner: is the owner connected - lastSeenAt (last log-in to the Mini App, null = never) and
// botReachable (did the last bot message reach them; null = unknown / never opened the app).
type MerchantAccount = Pick<
  Merchant,
  "id" | "name" | "telegramId" | "isActive" | "payoutDetails" | "contact" | "createdAt"
> & { owner: { lastSeenAt: Date | null; botReachable: boolean | null } };

const NO_OWNER = { lastSeenAt: null, botReachable: null };
import { SiteRebuildService } from "@/site/site-rebuild.service";

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly venuesService: VenuesService,
    private readonly siteRebuild: SiteRebuildService,
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

    return this.toAccounts(await qb.getMany());
  }

  async findOneAdmin(id: number): Promise<MerchantAccount & { venues: VenueDetail[] }> {
    const merchant = await this.findEntity(id);

    const [account] = await this.toAccounts([merchant]);

    return { ...account, venues: await this.venuesService.listForMerchant(id) };
  }

  async create(dto: CreateMerchantDto): Promise<MerchantAccount> {
    const saved = await this.merchantRepo.save(
      this.merchantRepo.create({
        ...dto,
        payoutDetails: dto.payoutDetails.trim(),
        contact: dto.contact.trim(),
      }),
    );

    this.logger.log(`Merchant created: id=${saved.id} name="${saved.name}"`);

    const [account] = await this.toAccounts([saved]);

    return account;
  }

  async updateAdmin(id: number, dto: AdminUpdateMerchantDto): Promise<MerchantAccount> {
    const merchant = await this.findEntity(id);

    Object.assign(merchant, definedFields(dto));

    // Stored trimmed (the DTO already refuses blank ones).
    for (const key of ["payoutDetails", "contact"] as const) {
      if (dto[key] !== undefined) {
        merchant[key] = dto[key].trim();
      }
    }

    const saved = await this.merchantRepo.save(merchant);

    this.logger.log(`Merchant updated: id=${id}`);

    // Hides / shows all of its venues on the website.
    if (dto.isActive !== undefined) {
      this.siteRebuild.request(`merchant ${id}`);
    }

    const [account] = await this.toAccounts([saved]);

    return account;
  }

  // The owners' users rows (by telegramId) in one query.
  private async toAccounts(merchants: Merchant[]): Promise<MerchantAccount[]> {
    const users = merchants.length
      ? await this.userRepo.find({
          where: { telegramId: In(merchants.map((m) => m.telegramId)) },
          select: { telegramId: true, lastSeenAt: true, botReachable: true },
        })
      : [];
    const byTelegramId = new Map(users.map((u) => [u.telegramId, u]));

    return merchants.map(
      ({ id, name, telegramId, isActive, payoutDetails, contact, createdAt }) => {
        const owner = byTelegramId.get(telegramId);

        return {
          id,
          name,
          telegramId,
          isActive,
          payoutDetails,
          contact,
          createdAt,
          owner: owner
            ? { lastSeenAt: owner.lastSeenAt, botReachable: owner.botReachable }
            : NO_OWNER,
        };
      },
    );
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
