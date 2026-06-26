import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { createHmac } from "crypto";
import { User } from "../users/entities/user.entity";
import { Merchant } from "../merchants/entities/merchant.entity";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly jwtService: JwtService,
  ) {}

  async logIn(
    initData: string,
  ): Promise<{ accessToken: string; role: string }> {
    const telegramId = this.verifyInitData(initData);

    let user = await this.userRepository.findOne({ where: { telegramId } });

    const merchant = await this.merchantRepository.findOne({
      where: { merchantTelegramId: telegramId, isActive: true },
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

    this.logger.log(`Login: telegramId=${telegramId} role=${user.role}`);

    return { accessToken, role: user.role };
  }

  private verifyInitData(initData: string): number {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      throw new UnauthorizedException("Missing hash in initData");
    }

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData")
      .update(process.env.BOT_TOKEN ?? "")
      .digest();

    const computedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) {
      throw new UnauthorizedException("Invalid initData signature");
    }

    const userParam = params.get("user");
    if (!userParam) {
      throw new UnauthorizedException("Missing user in initData");
    }

    const telegramUser = JSON.parse(userParam) as { id: number };
    return telegramUser.id;
  }
}
