import { Injectable, Logger, type OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { User } from "../users/entities/user.entity";
import { Merchant } from "../merchants/entities/merchant.entity";
import type { Language } from "@/common/translations";
import { botToken } from "@/telegram/bot-token";

// Telegram doesn't refresh initData while the Mini App stays open, and the
// frontend re-logs-in with the same string on 401 - so this must outlast a
// realistic session, not just the JWT TTL.
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
// Tolerate small clock drift between Telegram and our server.
const INIT_DATA_MAX_FUTURE_SKEW_SEC = 60;

// 24 random bytes, base64url.
const GUEST_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const hashGuestToken = (token: string): string => createHash("sha256").update(token).digest("hex");

// Telegram allows 64; kept short - it goes into a gift screen.
const FIRST_NAME_MAX = 64;

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

  // Doesn't stop the app (public routes and the Finik webhook keep working) - log-in just
  // refuses - but makes the misconfiguration visible at boot, not at the first login.
  onModuleInit(): void {
    if (!botToken()) {
      this.logger.error("BOT_TOKEN is not set - every log-in will be refused");
    }
  }

  // language: the app's current language (Accept-Language), remembered for bot messages.
  async logIn(
    initData: string,
    language: Language | null = null,
  ): Promise<{ accessToken: string; role: string }> {
    const { telegramId, firstName } = this.verifyInitData(initData);

    let user = await this.userRepository.findOne({ where: { telegramId } });

    // Any status: a merchant's owner gets / keeps the role whether the merchant is active or not
    // (a deactivated one keeps the cabinet and redemption - and one created deactivated, before
    // the owner's first log-in, gets it too, since 2026-11-10); only an owner with no merchant at
    // all any more (telegramId changed by the admin) goes back to "user".
    const merchant = await this.merchantRepository.findOne({ where: { telegramId } });

    if (!user) {
      const role = merchant ? "merchant" : "user";
      user = this.userRepository.create({
        telegramId,
        role,
        language,
        firstName,
        lastSeenAt: new Date(),
      });
      user = await this.userRepository.save(user);
    } else {
      const promote = merchant !== null && user.role === "user";
      const demote = merchant === null && user.role === "merchant";
      const relang = language !== null && language !== user.language;

      const role = promote ? ("merchant" as const) : demote ? ("user" as const) : undefined;

      // lastSeenAt on every log-in - the admin sees whether an owner ever opened the app.
      await this.userRepository.update(user.id, {
        lastSeenAt: new Date(),
        firstName,
        ...(role ? { role } : {}),
        ...(relang ? { language } : {}),
      });

      if (role) {
        user.role = role;
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

  // A website guest (docs/web-version.md): no Telegram, no sign-up - the browser keeps a secret
  // (guestToken) and trades it for a JWT. A known token → the same guest; none, unknown or
  // malformed → a new one (a cleared / stale browser storage just starts over - their earlier
  // purchases stay reachable by the order link, and «Войти через Telegram» keeps them for good).
  async guestLogIn(
    guestToken?: string,
    language: Language | null = null,
  ): Promise<{ accessToken: string; role: string; guestToken: string }> {
    const known =
      guestToken && GUEST_TOKEN.test(guestToken)
        ? await this.userRepository.findOne({
            where: { guestTokenHash: hashGuestToken(guestToken) },
          })
        : null;
    let user: User;
    let token: string;

    if (known) {
      user = known;
      token = guestToken!;
      await this.userRepository.update(user.id, {
        lastSeenAt: new Date(),
        ...(language !== null && language !== user.language ? { language } : {}),
      });
    } else {
      token = randomBytes(24).toString("base64url");
      user = await this.userRepository.save(
        this.userRepository.create({
          telegramId: null,
          guestTokenHash: hashGuestToken(token),
          role: "user",
          language,
          lastSeenAt: new Date(),
        }),
      );
      this.logger.log(`Guest created: user ${user.id}`);
    }

    const accessToken = this.jwtService.sign({
      userId: user.id,
      role: user.role,
      telegramId: null,
    });

    return { accessToken, role: user.role, guestToken: token };
  }

  private verifyInitData(initData: string): { telegramId: number; firstName: string | null } {
    const token = botToken();

    // With an empty BOT_TOKEN the HMAC key would be HMAC("WebAppData", "") - public knowledge, so
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
    // field (Ed25519, for third-party validation) MUST stay in - Telegram
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
    let firstName: unknown;
    try {
      ({ id: telegramId, first_name: firstName } = JSON.parse(userParam) as {
        id?: unknown;
        first_name?: unknown;
      });
    } catch {
      throw new UnauthorizedException("Malformed user in initData");
    }

    if (!Number.isSafeInteger(telegramId) || (telegramId as number) <= 0) {
      throw new UnauthorizedException("Malformed user in initData");
    }

    return {
      telegramId: telegramId as number,
      // Signed with the rest; the name the person set in Telegram (for «Подарок от …»).
      firstName:
        typeof firstName === "string" && firstName.trim()
          ? firstName.trim().slice(0, FIRST_NAME_MAX)
          : null,
    };
  }
}
