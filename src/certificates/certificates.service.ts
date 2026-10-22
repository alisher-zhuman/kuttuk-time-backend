import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import {
  effectiveStatusSql,
  usedAtField,
  type EffectiveCertificateStatus,
} from "./effective-status";

export interface MyCertificate {
  id: string;
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  // Present only for "used" — the key is absent otherwise (frontend contract).
  usedAt?: Date;
  createdAt: Date;
  venue: { id: number; name: string; slug: string; logo: string };
}

interface Row {
  id: string;
  code: string;
  amount: number;
  status: EffectiveCertificateStatus;
  validUntil: Date;
  usedAt: Date | null;
  createdAt: Date;
  venueId: number;
  venueName: string;
  venueSlug: string;
  venueLogo: string;
}

const EFFECTIVE_STATUS = effectiveStatusSql("c");

@Injectable()
export class CertificatesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findMine(userId: number): Promise<MyCertificate[]> {
    // One query with the venue joined (no N+1); sorted in SQL: active first, newest first.
    // Inactive venues / merchants are included on purpose — the buyer still owns those certificates.
    const rows: Row[] = await this.dataSource.query(
      `SELECT c."id", c."code", c."amount", ${EFFECTIVE_STATUS} AS "status",
              c."validUntil", c."usedAt", c."createdAt",
              v."id" AS "venueId", v."name" AS "venueName",
              v."slug" AS "venueSlug", v."logo" AS "venueLogo"
         FROM "certificates" c
         JOIN "venues" v ON v."id" = c."venueId"
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
      ...usedAtField(row.status, row.usedAt),
      createdAt: row.createdAt,
      venue: {
        id: row.venueId,
        name: row.venueName,
        slug: row.venueSlug,
        logo: row.venueLogo,
      },
    }));
  }
}
