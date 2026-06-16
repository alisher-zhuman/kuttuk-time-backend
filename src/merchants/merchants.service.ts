import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Merchant } from "./entities/merchant.entity";
import { Certificate } from "./entities/certificate.entity";
import { CreateMerchantDto } from "./dto/create-merchant.dto";
import { UpdateMerchantDto } from "./dto/update-merchant.dto";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";

interface CurrentUser {
  userId: number;
  role: string;
  telegramId: number;
}

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Certificate)
    private readonly certificateRepo: Repository<Certificate>,
  ) {}

  findAll(): Promise<Merchant[]> {
    return this.merchantRepo.find({ where: { isActive: true } });
  }

  async findOne(id: number): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({
      where: { id },
      relations: ["certificates"],
    });
    if (!merchant) throw new NotFoundException("Merchant not found");
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
    const isOwner = merchant.ownerTelegramId === user.telegramId;
    if (!isOwner && user.role !== "admin") throw new ForbiddenException();
    Object.assign(merchant, dto);
    return this.merchantRepo.save(merchant);
  }

  async findCertificates(merchantId: number): Promise<Certificate[]> {
    await this.findOne(merchantId);
    return this.certificateRepo.find({
      where: { merchantId, isActive: true },
    });
  }

  async createCertificate(
    merchantId: number,
    dto: CreateCertificateDto,
    user: CurrentUser,
  ): Promise<Certificate> {
    const merchant = await this.findOne(merchantId);
    const isOwner = merchant.ownerTelegramId === user.telegramId;
    if (!isOwner && user.role !== "admin") throw new ForbiddenException();
    const cert = this.certificateRepo.create({ ...dto, merchantId });
    return this.certificateRepo.save(cert);
  }

  async updateCertificate(
    merchantId: number,
    certId: number,
    dto: UpdateCertificateDto,
    user: CurrentUser,
  ): Promise<Certificate> {
    const merchant = await this.findOne(merchantId);
    const isOwner = merchant.ownerTelegramId === user.telegramId;
    if (!isOwner && user.role !== "admin") throw new ForbiddenException();
    const cert = await this.certificateRepo.findOne({
      where: { id: certId, merchantId },
    });
    if (!cert) throw new NotFoundException("Certificate not found");
    Object.assign(cert, dto);
    return this.certificateRepo.save(cert);
  }
}
