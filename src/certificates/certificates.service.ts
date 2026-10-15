import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

export type EffectiveCertificateStatus = "active" | "used" | "expired";

export interface MyCertificate {
  id: string;
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  // Present only for "used" — the key is absent otherwise (frontend contract).
  usedAt?: Date;
  createdAt: Date;
  merchant: { id: number; name: string; slug: string; logo: string };
}

interface Row {
  id: string;
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  usedAt: Date | null;
  createdAt: Date;
  merchantId: number;
  merchantName: string;
  merchantSlug: string;
  merchantLogo: string;
}

// "active" in the DB isn't necessarily valid: past validUntil it is expired. There's no cron
// for certificates — the effective status is computed on read, here and in SQL only.
const EFFECTIVE_STATUS = `CASE WHEN c."status" = 'active' AND c."validUntil" < now() THEN 'expired' ELSE c."status"::text END`;

@Injectable()
export class CertificatesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findMine(userId: number): Promise<MyCertificate[]> {
    // One query with the merchant joined (no N+1); sorted in SQL: active first, newest first.
    // Inactive merchants are included on purpose — the buyer still owns those certificates.
    const rows: Row[] = await this.dataSource.query(
      `SELECT c."id", c."code", c."amount", ${EFFECTIVE_STATUS} AS "status",
              c."validUntil", c."usedAt", c."createdAt",
              m."id" AS "merchantId", m."name" AS "merchantName",
              m."slug" AS "merchantSlug", m."logo" AS "merchantLogo"
         FROM "certificates" c
         JOIN "merchants" m ON m."id" = c."merchantId"
        WHERE c."ownerUserId" = $1
        ORDER BY CASE WHEN ${EFFECTIVE_STATUS} = 'active' THEN 0 ELSE 1 END,
                 c."createdAt" DESC,
                 c."id"`,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      amount: row.amount,
      status: row.status,
      validUntil: row.validUntil,
      ...(row.status === "used" && row.usedAt ? { usedAt: row.usedAt } : {}),
      createdAt: row.createdAt,
      merchant: {
        id: row.merchantId,
        name: row.merchantName,
        slug: row.merchantSlug,
        logo: row.merchantLogo,
      },
    }));
  }
}
