import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { User } from "../users/entities/user.entity";
import { Merchant } from "../merchants/entities/merchant.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    telegramId: number,
  ): Promise<{ accessToken: string; role: string }> {
    let user = await this.userRepository.findOne({ where: { telegramId } });

    const merchant = await this.merchantRepository.findOne({
      where: { ownerTelegramId: telegramId, isActive: true },
    });

    if (!user) {
      const role = merchant ? "merchant" : "user";
      user = this.userRepository.create({ telegramId, role });
      user = await this.userRepository.save(user);
    } else if (merchant && user.role === "user") {
      user.role = "merchant";
      await this.userRepository.save(user);
    }

    const payload = {
      userId: user.id,
      role: user.role,
      telegramId: user.telegramId,
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, role: user.role };
  }
}
