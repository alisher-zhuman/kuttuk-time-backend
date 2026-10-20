import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Venue } from "./entities/venue.entity";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";
import { AdminUpdateVenueDto } from "./dto/admin-update-venue.dto";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { CloudinaryService } from "@/cloudinary/cloudinary.service";
import { resolveTranslation } from "@/common/utils/resolve-translation";
import { definedFields } from "@/common/utils/defined-fields";

// The storefront as its owner / the admin edit it (raw translations).
export type VenueDetail = Pick<
  Venue,
  | "id"
  | "name"
  | "description"
  | "categories"
  | "nominals"
  | "validityMonths"
  | "logo"
  | "slug"
  | "isActive"
  | "createdAt"
>;

const DETAIL_COLUMNS = [
  "id",
  "name",
  "description",
  "categories",
  "nominals",
  "validityMonths",
  "logo",
  "slug",
  "isActive",
  "createdAt",
] as const;

const toDetail = (venue: Venue): VenueDetail =>
  Object.fromEntries(DETAIL_COLUMNS.map((key) => [key, venue[key]])) as VenueDetail;

@Injectable()
export class VenuesService {
  private readonly logger = new Logger(VenuesService.name);

  constructor(
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // Buyers see a venue only while both it and its merchant are active.
  private visible() {
    return this.venueRepo
      .createQueryBuilder("venue")
      .innerJoin("venue.merchant", "merchant")
      .where("venue.isActive = true")
      .andWhere("merchant.isActive = true");
  }

  async findAll(
    lang: string,
    search?: string,
    category?: number,
  ): Promise<
    { id: number; name: string; description: string; logo: string; minNominal: number }[]
  > {
    const qb = this.visible()
      .select(["venue.id", "venue.name", "venue.description", "venue.logo", "venue.nominals"])
      .orderBy("venue.id", "ASC");

    if (category) {
      qb.andWhere(":category = ANY(venue.categories)", { category });
    }

    if (search) {
      qb.andWhere("venue.name ILIKE :search", { search: `%${search}%` });
    }

    const venues = await qb.getMany();

    return venues.map(({ id, name, description, logo, nominals }) => ({
      id,
      name,
      description: resolveTranslation(description, lang),
      logo,
      minNominal: Math.min(...nominals),
    }));
  }

  async findOne(
    idOrSlug: string,
    lang: string,
  ): Promise<{
    id: number;
    name: string;
    description: string;
    logo: string;
    nominals: number[];
    validityMonths: number;
  }> {
    const numericId = Number(idOrSlug);
    const qb = this.visible();

    if (isNaN(numericId)) {
      qb.andWhere("venue.slug = :slug", { slug: idOrSlug });
    } else {
      qb.andWhere("venue.id = :id", { id: numericId });
    }

    const venue = await qb.getOne();

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    return {
      id: venue.id,
      name: venue.name,
      description: resolveTranslation(venue.description, lang),
      logo: venue.logo,
      nominals: venue.nominals,
      validityMonths: venue.validityMonths,
    };
  }

  // The merchant's own venues (any status), for GET /merchants/me and the admin detail.
  async listForMerchant(merchantId: number): Promise<VenueDetail[]> {
    const venues = await this.venueRepo.find({ where: { merchantId }, order: { id: "ASC" } });

    return venues.map(toDetail);
  }

  async updateOwn(merchantId: number, venueId: number, dto: UpdateVenueDto): Promise<VenueDetail> {
    const venue = await this.venueRepo.findOne({ where: { id: venueId, merchantId } });

    // Another merchant's venue looks the same as a missing one.
    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    return toDetail(await this.applyUpdate(venue, dto));
  }

  async findAllAdmin(filters: {
    search?: string;
    category?: number;
    isActive?: boolean;
    merchantId?: number;
  }): Promise<Pick<Venue, "id" | "name" | "logo" | "isActive" | "merchantId">[]> {
    const qb = this.venueRepo
      .createQueryBuilder("venue")
      .select(["venue.id", "venue.name", "venue.logo", "venue.isActive", "venue.merchantId"])
      .orderBy("venue.id", "ASC");

    if (filters.isActive !== undefined) {
      qb.andWhere("venue.isActive = :isActive", { isActive: filters.isActive });
    }

    if (filters.merchantId) {
      qb.andWhere("venue.merchantId = :merchantId", { merchantId: filters.merchantId });
    }

    if (filters.category) {
      qb.andWhere(":category = ANY(venue.categories)", { category: filters.category });
    }

    if (filters.search) {
      qb.andWhere("venue.name ILIKE :search", { search: `%${filters.search}%` });
    }

    return qb.getMany();
  }

  async findOneAdmin(id: number): Promise<VenueDetail & { merchantId: number }> {
    const venue = await this.findEntity(id);

    return { ...toDetail(venue), merchantId: venue.merchantId };
  }

  async create(dto: CreateVenueDto): Promise<VenueDetail & { merchantId: number }> {
    await this.assertMerchantExists(dto.merchantId);

    const saved = await this.venueRepo.save(this.venueRepo.create(dto));

    this.logger.log(
      `Venue created: id=${saved.id} merchant=${saved.merchantId} name="${saved.name}"`,
    );

    return { ...toDetail(saved), merchantId: saved.merchantId };
  }

  async updateAdmin(
    id: number,
    dto: AdminUpdateVenueDto,
  ): Promise<VenueDetail & { merchantId: number }> {
    const venue = await this.findEntity(id);

    if (dto.merchantId !== undefined && dto.merchantId !== venue.merchantId) {
      await this.assertMerchantExists(dto.merchantId);
    }

    const saved = await this.applyUpdate(venue, dto);

    return { ...toDetail(saved), merchantId: saved.merchantId };
  }

  // A body reference, not the resource in the path: 400, not 404.
  private async assertMerchantExists(merchantId: number): Promise<void> {
    if (!(await this.merchantRepo.exists({ where: { id: merchantId } }))) {
      throw new BadRequestException("Merchant not found");
    }
  }

  private async applyUpdate(venue: Venue, dto: UpdateVenueDto | AdminUpdateVenueDto) {
    const oldLogo = venue.logo;

    Object.assign(venue, definedFields(dto));

    const saved = await this.venueRepo.save(venue);

    this.logger.log(`Venue updated: id=${venue.id}`);

    // Delete the old logo only after the save succeeded — otherwise a failed
    // save (e.g. 409 on slug) would leave the DB pointing at a deleted image.
    if (dto.logo && oldLogo && oldLogo !== dto.logo) {
      const publicId = this.extractCloudinaryPublicId(oldLogo);

      if (publicId) {
        // The update is already saved; a leftover file is harmless, so don't fail the request
        await this.cloudinaryService
          .deleteFile(publicId)
          .catch((err: Error) =>
            this.logger.warn(`Old logo cleanup failed: ${publicId} (${err.message})`),
          );
      }
    }

    return saved;
  }

  private async findEntity(id: number): Promise<Venue> {
    const venue = await this.venueRepo.findOne({ where: { id } });

    if (!venue) {
      throw new NotFoundException("Venue not found");
    }

    return venue;
  }

  private extractCloudinaryPublicId(url: string): string | null {
    const match = url.match(/\/upload\/v\d+\/(.+)\.[a-z]+$/);
    return match ? match[1] : null;
  }
}
