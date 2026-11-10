import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";

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
  // Present only for "used" - the key is absent otherwise (frontend contract).
  usedAt?: Date;
  // Present only when the caller gave it away and the friend claimed it: the certificate is the
  // friend's now, the caller sees it as «Подарен» (no QR, no code shown, no «Подарить»).
  giftedAt?: Date;
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
  giftedAt: Date | null;
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

  // The caller's certificates, plus the ones they gave away (with giftedAt). One query with the
  // venue joined (no N+1); sorted in SQL: own active first, then newest first. Inactive venues /
  // merchants are included on purpose - the owner still has those certificates.
  // `certificateId` narrows it to one (the answer to «Забрать»).
  async findMine(
    userId: number,
    certificateId?: string,
    em: EntityManager = this.dataSource.manager,
  ): Promise<MyCertificate[]> {
    const rows: Row[] = await em.query(
      `SELECT c."id", c."code", c."amount", ${EFFECTIVE_STATUS} AS "status",
              c."validUntil", c."usedAt", c."createdAt",
              CASE WHEN c."ownerUserId" = $1 THEN NULL ELSE given."claimedAt" END AS "giftedAt",
              v."id" AS "venueId", v."name" AS "venueName",
              v."slug" AS "venueSlug", v."logo" AS "venueLogo"
         FROM "certificates" c
         JOIN "venues" v ON v."id" = c."venueId"
         LEFT JOIN LATERAL (
           SELECT g."claimedAt" FROM "certificate_gifts" g
            WHERE g."certificateId" = c."id" AND g."fromUserId" = $1 AND g."claimedAt" IS NOT NULL
            ORDER BY g."claimedAt" DESC LIMIT 1
         ) given ON true
        WHERE (c."ownerUserId" = $1 OR given."claimedAt" IS NOT NULL)
          AND ($2::uuid IS NULL OR c."id" = $2::uuid)
        ORDER BY CASE WHEN c."ownerUserId" = $1 AND ${EFFECTIVE_STATUS} = 'active' THEN 0 ELSE 1 END,
                 c."createdAt" DESC,
                 c."id"`,
      [userId, certificateId ?? null],
    );

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      amount: row.amount,
      status: row.status,
      validUntil: row.validUntil,
      ...usedAtField(row.status, row.usedAt),
      ...(row.giftedAt ? { giftedAt: row.giftedAt } : {}),
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
