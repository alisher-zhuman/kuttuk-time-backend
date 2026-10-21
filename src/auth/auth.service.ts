import { Injectable, Logger, type OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { createHmac, timingSafeEqual } from "crypto";
import { User } from "../users/entities/user.entity";
import { Merchant } from "../merchants/entities/merchant.entity";
import type { Language } from "@/common/translations";
import { botToken } from "@/telegram/bot-token";

// Telegram doesn't refresh initData while the Mini App stays open, and the
// frontend re-logs-in with the same string on 401 — so this must outlast a
// realistic session, not just the JWT TTL.
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
// Tolerate small clock drift between Telegram and our server.
const INIT_DATA_MAX_FUTURE_SKEW_SEC = 60;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly jwtService: JwtService,
  ) {}

  // Doesn't stop the app (public routes and the Finik webhook keep working) — log-in just
  // refuses — but makes the misconfiguration visible at boot, not at the first login.
  onModuleInit(): void {
    if (!botToken()) {
      this.logger.error("BOT_TOKEN is not set — every log-in will be refused");
    }
  }

  // language: the app's current language (Accept-Language), remembered for bot messages.
  async logIn(
    initData: string,
    language: Language | null = null,
  ): Promise<{ accessToken: string; role: string }> {
    const telegramId = this.verifyInitData(initData);

    let user = await this.userRepository.findOne({ where: { telegramId } });

    const merchant = await this.merchantRepository.findOne({
      where: { telegramId, isActive: true },
    });

    if (!user) {
      const role = merchant ? "merchant" : "user";
      user = this.userRepository.create({ telegramId, role, language });
      user = await this.userRepository.save(user);
    } else {
      const promote = merchant && user.role === "user";
      const relang = language !== null && language !== user.language;

      if (promote || relang) {
        await this.userRepository.update(user.id, {
          ...(promote ? { role: "merchant" as const } : {}),
          ...(relang ? { language } : {}),
        });

        if (promote) {
          user.role = "merchant";
        }
      }
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
    const token = botToken();

    // With an empty BOT_TOKEN the HMAC key would be HMAC("WebAppData", "") — public knowledge, so
    // anyone could forge initData for any telegramId (incl. an admin). Fail closed instead.
    if (!token) {
      this.logger.error("Log-in refused: BOT_TOKEN is not set");

      throw new UnauthorizedException("Log-in is unavailable");
    }

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      throw new UnauthorizedException("Missing hash in initData");
    }

    // Only "hash" is excluded from the data-check-string. The "signature"
    // field (Ed25519, for third-party validation) MUST stay in — Telegram
    // computes the HMAC hash with it present.
    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(token).digest();

    const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
    const receivedHash = Buffer.from(hash, "hex");

    if (
      receivedHash.length !== computedHash.length ||
      !timingSafeEqual(receivedHash, computedHash)
    ) {
      throw new UnauthorizedException("Invalid initData signature");
    }

    const authDate = Number(params.get("auth_date"));
    const ageSec = Math.floor(Date.now() / 1000) - authDate;

    if (
      !Number.isInteger(authDate) ||
      ageSec > INIT_DATA_MAX_AGE_SEC ||
      ageSec < -INIT_DATA_MAX_FUTURE_SKEW_SEC
    ) {
      throw new UnauthorizedException("initData expired");
    }

    const userParam = params.get("user");
    if (!userParam) {
      throw new UnauthorizedException("Missing user in initData");
    }

    let telegramId: unknown;
    try {
      telegramId = (JSON.parse(userParam) as { id?: unknown }).id;
    } catch {
      throw new UnauthorizedException("Malformed user in initData");
    }

    if (!Number.isSafeInteger(telegramId) || (telegramId as number) <= 0) {
      throw new UnauthorizedException("Malformed user in initData");
    }

    return telegramId as number;
  }
}
