import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager, Repository } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { lockOrder, payAndIssueCertificate } from "./order-fulfillment";
import { SaleNotifier } from "./sale-notifier";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";
import { FinikWebhookVerifier, type IncomingWebhook } from "@/finik/finik-webhook.verifier";
import { finikConfig } from "@/finik/finik.config";

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

const DAY_MS = 24 * 60 * 60 * 1000;
// A plausible payment time: not older than this (a retry or a re-sent webhook can be days late),
// not in the future beyond clock skew.
const PAID_AT_MAX_AGE_MS = 30 * DAY_MS;
const PAID_AT_MAX_AHEAD_MS = DAY_MS;

// Finik sends unix ms (number); a numeric string or an ISO date is tolerated too. paidAt decides
// the payout week and validUntil, so an implausible value (seconds instead of ms → 1970, a
// timezone-less string read hours off into the future, …) falls back to now — returned with
// `suspicious` so the caller logs it.
const paidAtFrom = (
  transactionDate: unknown,
  now = Date.now(),
): { paidAt: Date; suspicious: boolean } => {
  const value =
    typeof transactionDate === "string" && /^\d+$/.test(transactionDate)
      ? Number(transactionDate)
      : transactionDate;
  const date = typeof value === "number" || typeof value === "string" ? new Date(value) : null;
  const time = date?.getTime() ?? Number.NaN;

  if (Number.isNaN(time) || time < now - PAID_AT_MAX_AGE_MS || time > now + PAID_AT_MAX_AHEAD_MS) {
    return { paidAt: new Date(now), suspicious: transactionDate !== undefined };
  }

  return { paidAt: date!, suspicious: false };
};

@Injectable()
export class FinikWebhookService {
  private readonly logger = new Logger(FinikWebhookService.name);

  constructor(
    private readonly verifier: FinikWebhookVerifier,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FinikWebhookEvent)
    private readonly eventRepo: Repository<FinikWebhookEvent>,
    private readonly saleNotifier: SaleNotifier,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  async handle(webhook: IncomingWebhook): Promise<void> {
    const signatureValid = this.verifier.verify(webhook);

    // Written first and outside the payment transaction, so it survives a rollback. The body
    // is kept only for signed requests (needed to re-verify a dispute): an unsigned one is
    // anyone's — storing it would let junk fill the database through a public route.
    const event = await this.eventRepo.save({
      id: randomUUID(),
      signatureValid,
      headers: this.verifier.auditHeaders(webhook.headers),
      body: signatureValid ? (webhook.body ?? null) : { omitted: "invalid_signature" },
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

    // Only on the transition to paid (committed above), so a retried delivery (already_paid)
    // never sends twice. Not awaited: Finik's answer mustn't wait on Telegram.
    if (outcome.orderId && (outcome.result === "paid" || outcome.result === "paid_after_expiry")) {
      void this.saleNotifier.notifyPaid(outcome.orderId);
    }
  }

  private async apply(em: EntityManager, rawBody: unknown): Promise<Outcome> {
    const body = asRecord(rawBody) ?? {};
    const paymentId = asRecord(body.fields)?.paymentId;

    if (typeof paymentId !== "string" || !UUID.test(paymentId)) {
      return { result: "order_not_found", orderId: null };
    }

    const order = await lockOrder(em, paymentId);

    if (!order) {
      return { result: "order_not_found", orderId: null };
    }

    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";

    if (!SUCCESS_STATUSES.has(status)) {
      return { result: `ignored_status: ${String(body.status).slice(0, 100)}`, orderId: order.id };
    }

    // The signature only proves Finik sent it, not that the money came to *our* account: someone
    // with their own Finik account could create a payment there with our order's id as its
    // PaymentId and our webhook URL. The account id is inside the signed body.
    const accountId = asRecord(body.data)?.accountId;

    if (accountId !== this.finik.accountId) {
      this.logger.error(
        `Finik webhook for order ${order.id}: payment to another account (${JSON.stringify(accountId)}) — ignored`,
      );

      return { result: "ignored_foreign_account", orderId: order.id };
    }

    // Terminal for the webhook: a duplicate delivery or an order already resolved by hand.
    if (
      order.status === OrderStatus.Paid ||
      order.status === OrderStatus.NeedsReview ||
      order.status === OrderStatus.Refunded
    ) {
      return { result: `already_${order.status}`, orderId: order.id };
    }

    const finikTransactionId = typeof body.id === "string" ? body.id : null;
    const { paidAt, suspicious } = paidAtFrom(body.transactionDate);

    if (suspicious) {
      this.logger.error(
        `Order ${order.id}: implausible transactionDate ${JSON.stringify(body.transactionDate)} — using now`,
      );
    }

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
    await payAndIssueCertificate(em, order, { paidAt, finikTransactionId });

    return {
      result: order.status === OrderStatus.Expired ? "paid_after_expiry" : "paid",
      orderId: order.id,
    };
  }
}
