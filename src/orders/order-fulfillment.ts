import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { generateCertificateCode } from "@/certificates/certificate-code";
import { addMonths } from "@/common/utils/add-months";

// Shared by the Finik webhook and the manual needs_review resolution (scripts/), so a
// certificate is always issued the same way. Plain functions on an EntityManager — the caller
// owns the transaction; no Nest DI needed.

export const CERTIFICATE_CODE_ATTEMPTS = 5;

// Row lock: concurrent webhook deliveries / a webhook racing a manual resolution serialize here.
export const lockOrder = (em: EntityManager, id: string): Promise<Order | null> =>
  em
    .getRepository(Order)
    .createQueryBuilder("order")
    .setLock("pessimistic_write")
    .where("order.id = :id", { id })
    .getOne();

export interface IssuedCertificate {
  code: string;
  validUntil: Date;
}

// Order → paid, plus its certificate: validUntil = paidAt + merchant.validityMonths.
// finikTransactionId: undefined leaves the stored value as is.
export const payAndIssueCertificate = async (
  em: EntityManager,
  order: Order,
  { paidAt, finikTransactionId }: { paidAt: Date; finikTransactionId?: string | null },
): Promise<IssuedCertificate> => {
  await em.update(Order, order.id, {
    status: OrderStatus.Paid,
    paidAt,
    ...(finikTransactionId !== undefined ? { finikTransactionId } : {}),
  });

  const merchant = await em.findOneByOrFail(Merchant, { id: order.merchantId });
  const validUntil = addMonths(paidAt, merchant.validityMonths);

  // ON CONFLICT instead of catching the unique violation: an error would abort the transaction.
  for (let attempt = 1; attempt <= CERTIFICATE_CODE_ATTEMPTS; attempt++) {
    const inserted: Array<{ code: string }> = await em.query(
      `INSERT INTO "certificates" ("id", "code", "orderId", "merchantId", "ownerUserId", "amount", "validUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("code") DO NOTHING
       RETURNING "code"`,
      [
        randomUUID(),
        generateCertificateCode(),
        order.id,
        order.merchantId,
        order.userId,
        order.amount,
        validUntil,
      ],
    );

    if (inserted.length > 0) {
      return { code: inserted[0].code, validUntil };
    }
  }

  throw new Error(
    `Could not generate a unique certificate code in ${CERTIFICATE_CODE_ATTEMPTS} attempts`,
  );
};
