import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager, Repository } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { Merchant } from "@/merchants/entities/merchant.entity";
import { generateCertificateCode } from "@/certificates/certificate-code";
import { addMonths } from "@/common/utils/add-months";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";
import { FinikWebhookVerifier, type IncomingWebhook } from "@/finik/finik-webhook.verifier";

export const CERTIFICATE_CODE_ATTEMPTS = 5;

const SUCCESS_STATUSES = new Set(["success", "succeeded"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Outcome {
  result: string;
  orderId: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// Finik sends unix ms (number); a numeric string or an ISO date is tolerated too.
const paidAtFrom = (transactionDate: unknown): Date => {
  const value =
    typeof transactionDate === "string" && /^\d+$/.test(transactionDate)
      ? Number(transactionDate)
      : transactionDate;
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : new Date();
};

@Injectable()
export class FinikWebhookService {
  private readonly logger = new Logger(FinikWebhookService.name);

  constructor(
    private readonly verifier: FinikWebhookVerifier,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FinikWebhookEvent)
    private readonly eventRepo: Repository<FinikWebhookEvent>,
  ) {}

  async handle(webhook: IncomingWebhook): Promise<void> {
    const signatureValid = this.verifier.verify(webhook);

    // Written first and outside the payment transaction, so it survives a rollback.
    const event = await this.eventRepo.save({
      id: randomUUID(),
      signatureValid,
      headers: this.verifier.auditHeaders(webhook.headers),
      body: webhook.body ?? null,
      result: "received",
      orderId: null,
    });

    if (!signatureValid) {
      await this.eventRepo.update(event.id, { result: "invalid_signature" });
      this.logger.warn(`Finik webhook ${event.id} rejected: invalid signature`);

      throw new UnauthorizedException("Invalid signature");
    }

    let outcome: Outcome;

    try {
      outcome = await this.dataSource.transaction((em) => this.apply(em, webhook.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.eventRepo.update(event.id, { result: `error: ${message}`.slice(0, 1000) });

      throw error;
    }

    await this.eventRepo.update(event.id, outcome);

    this.logger.log(`Finik webhook ${event.id}: ${outcome.result} order=${outcome.orderId ?? "-"}`);
  }

  private async apply(em: EntityManager, rawBody: unknown): Promise<Outcome> {
    const body = asRecord(rawBody) ?? {};
    const paymentId = asRecord(body.fields)?.paymentId;

    if (typeof paymentId !== "string" || !UUID.test(paymentId)) {
      return { result: "order_not_found", orderId: null };
    }

    // Row lock: concurrent deliveries of the same webhook serialize here.
    const order = await em
      .getRepository(Order)
      .createQueryBuilder("order")
      .setLock("pessimistic_write")
      .where("order.id = :id", { id: paymentId })
      .getOne();

    if (!order) {
      return { result: "order_not_found", orderId: null };
    }

    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";

    if (!SUCCESS_STATUSES.has(status)) {
      return { result: `ignored_status: ${String(body.status).slice(0, 100)}`, orderId: order.id };
    }

    if (order.status === OrderStatus.Paid || order.status === OrderStatus.NeedsReview) {
      return { result: `already_${order.status}`, orderId: order.id };
    }

    const finikTransactionId = typeof body.id === "string" ? body.id : null;
    const paidAt = paidAtFrom(body.transactionDate);

    if (body.amount !== order.amount) {
      await em.update(Order, order.id, {
        status: OrderStatus.NeedsReview,
        paidAt,
        finikTransactionId,
      });

      this.logger.error(
        `Order ${order.id} needs review: paid amount ${JSON.stringify(body.amount)} != order amount ${order.amount}`,
      );

      return { result: "needs_review: amount_mismatch", orderId: order.id };
    }

    // An expired order still gets paid: the money has already been taken.
    await em.update(Order, order.id, { status: OrderStatus.Paid, paidAt, finikTransactionId });

    const merchant = await em.findOneByOrFail(Merchant, { id: order.merchantId });

    await this.issueCertificate(em, order, addMonths(paidAt, merchant.validityMonths));

    return {
      result: order.status === OrderStatus.Expired ? "paid_after_expiry" : "paid",
      orderId: order.id,
    };
  }

  // ON CONFLICT instead of catching the unique violation: an error would abort the whole transaction.
  private async issueCertificate(em: EntityManager, order: Order, validUntil: Date): Promise<void> {
    for (let attempt = 1; attempt <= CERTIFICATE_CODE_ATTEMPTS; attempt++) {
      const inserted: unknown[] = await em.query(
        `INSERT INTO "certificates" ("id", "code", "orderId", "merchantId", "ownerUserId", "amount", "validUntil")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("code") DO NOTHING
         RETURNING "id"`,
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
        return;
      }
    }

    throw new Error(
      `Could not generate a unique certificate code in ${CERTIFICATE_CODE_ATTEMPTS} attempts`,
    );
  }
}
