import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { normalizeCertificateCode } from "./certificate-code";
import { ownMerchantId } from "./own-merchant";
import type { EffectiveCertificateStatus } from "./certificates.service";

export interface MerchantCertificate {
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  // Present only for "used" (same contract as GET /certificates/my).
  usedAt?: Date;
  createdAt: Date;
}

interface Row {
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// Same effective status as GET /certificates/my: a stored "active" past validUntil is expired.
const SELECT = `SELECT c."code", c."amount",
         CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired'
              ELSE c."status"::text END AS "status",
         c."validUntil", c."usedAt", c."createdAt"`;

const toView = (row: Row): MerchantCertificate => ({
  code: row.code,
  amount: row.amount,
  status: row.status,
  validUntil: row.validUntil,
  ...(row.status === "used" && row.usedAt ? { usedAt: row.usedAt } : {}),
  createdAt: row.createdAt,
});

// Redemption by the merchant owner (the only role that redeems — see CLAUDE.md → Product
// decisions). All-or-nothing, final: there's no undo in the app.
@Injectable()
export class RedemptionService {
  private readonly logger = new Logger(RedemptionService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async lookup(merchantTelegramId: number, rawCode: string): Promise<MerchantCertificate> {
    const code = this.parse(rawCode);
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);
    const row = await this.find(merchantId, code);

    if (!row) {
      throw this.notFound();
    }

    return toView(row);
  }

  async redeem(merchantTelegramId: number, rawCode: string): Promise<MerchantCertificate> {
    const code = this.parse(rawCode);
    const merchantId = await ownMerchantId(this.dataSource, merchantTelegramId);

    // One atomic statement: only an active, unexpired certificate of this merchant flips to
    // used. Two simultaneous taps → one UPDATE matches, the other matches nothing.
    const [rows]: [Row[], number] = await this.dataSource.query(
      `UPDATE "certificates" c SET "status" = 'used', "usedAt" = now()
        WHERE c."code" = $1 AND c."merchantId" = $2
          AND c."status" = 'active' AND c."validUntil" > now()
        RETURNING c."code", c."amount", 'used' AS "status", c."validUntil", c."usedAt", c."createdAt"`,
      [code, merchantId],
    );

    if (rows.length > 0) {
      this.logger.log(`Certificate ${code} redeemed by merchant ${merchantId}`);

      return toView(rows[0]);
    }

    // Nothing redeemed — say why. Read after the failed UPDATE, so a concurrent winner's
    // "used" is already visible here.
    const row = await this.find(merchantId, code);

    if (!row) {
      throw this.notFound();
    }

    if (row.status === "used") {
      throw new ConflictException({ message: "Certificate already used", error: "already_used" });
    }

    throw new ConflictException({ message: "Certificate expired", error: "expired" });
  }

  private parse(rawCode: string): string {
    const code = normalizeCertificateCode(rawCode);

    if (!code) {
      throw new BadRequestException("Invalid certificate code format (expected KT-XXXX-XXXX)");
    }

    return code;
  }

  private async find(merchantId: number, code: string): Promise<Row | undefined> {
    const [row]: Row[] = await this.dataSource.query(
      `${SELECT} FROM "certificates" c WHERE c."code" = $1 AND c."merchantId" = $2`,
      [code, merchantId],
    );

    return row;
  }

  // Another merchant's certificate and a non-existent code look the same — nothing leaks.
  private notFound(): NotFoundException {
    return new NotFoundException("Certificate not found");
  }
}
