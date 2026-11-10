import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, type EntityManager, Repository } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { lockOrder, payAndIssueCertificate } from "./order-fulfillment";
import { SaleNotifier } from "./sale-notifier";
import { FinikWebhookEvent } from "@/finik/entities/finik-webhook-event.entity";
import { AdminAlertsService } from "@/telegram/admin-alerts.service";
import { escapeHtml } from "@/telegram/telegram-bot.service";
import { FinikWebhookVerifier, type IncomingWebhook } from "@/finik/finik-webhook.verifier";
import { finikConfig } from "@/finik/finik.config";

const SUCCESS_STATUSES = new Set(["success", "succeeded"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Outcome {
  result: string;
  orderId: string | null;
}

// What the admins must hear about after the webhook is answered (never written to the audit row).
type Notice =
  | { kind: "needs_review"; paidAmount: unknown }
  | {
      kind: "duplicate_charge";
      status: OrderStatus;
      transactionId: string;
      paidAmount: unknown;
      amount: number;
    }
  | { kind: "foreign_account" }
  | { kind: "order_not_found"; paymentId: unknown };

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
// timezone-less string read hours off into the future, …) falls back to now - returned with
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
    private readonly alerts: AdminAlertsService,
  ) {}

  async handle(webhook: IncomingWebhook): Promise<void> {
    const signatureValid = this.verifier.verify(webhook);

    // Written first and outside the payment transaction, so it survives a rollback. The body
    // is kept only for signed requests (needed to re-verify a dispute): an unsigned one is
    // anyone's - storing it would let junk fill the database through a public route.
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
      // Usually a stranger probing the URL - but if Finik's own webhooks fail the check
      // (FINIK_WEBHOOK_URL / Finik's key changed), payments stop arriving: worth a look.
      void this.alerts.alert({
        kind: "finik_invalid_signature",
        throttle: true,
        html: "🚨 <b>Вебхук Финика с неверной подписью.</b>\n\nЕсли это Финик, оплаты не доходят: проверить <code>FINIK_WEBHOOK_URL</code> и ключ Финика (<code>FINIK_PUBLIC_KEY_B64</code>). Таблица <code>finik_webhook_events</code>.",
      });

      throw new UnauthorizedException("Invalid signature");
    }

    let outcome: Outcome;
    let notice: Notice | undefined;

    try {
      ({ notice, ...outcome } = await this.dataSource.transaction((em) =>
        this.apply(em, webhook.body),
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.eventRepo.update(event.id, { result: `error: ${message}`.slice(0, 1000) });
      // Finik retries for a day, but a bug here repeats on every retry - tell someone.
      void this.alerts.alert({
        kind: "finik_webhook_error",
        throttle: true,
        html: `🚨 <b>Ошибка при обработке вебхука Финика</b> (Финик повторит):\n<code>${escapeHtml(message.slice(0, 300))}</code>\n\nВебхук <code>${event.id}</code>, смотреть логи Koyeb.`,
      });

      throw error;
    }

    await this.eventRepo.update(event.id, outcome);

    this.logger.log(`Finik webhook ${event.id}: ${outcome.result} order=${outcome.orderId ?? "-"}`);

    // Only on the transition to paid (committed above), so a retried delivery (already_paid)
    // never sends twice. Not awaited: Finik's answer mustn't wait on Telegram.
    if (outcome.orderId && (outcome.result === "paid" || outcome.result === "paid_after_expiry")) {
      void this.saleNotifier.notifyPaid(outcome.orderId);
    }

    if (notice) {
      void this.announce(notice, outcome.orderId);
    }
  }

  private async announce(notice: Notice, orderId: string | null): Promise<void> {
    const order = orderId ? `Заказ <code>${orderId}</code>` : "";

    switch (notice.kind) {
      case "needs_review":
        // The buyer and the admins - one place for both texts.
        await this.saleNotifier.notifyNeedsReview(orderId!, notice.paidAmount);
        break;
      case "duplicate_charge":
        await this.alerts.alert({
          kind: "duplicate_charge",
          html: `⚠️ <b>Повторная оплата</b> - по заказу, который уже «${notice.status}», пришла ещё одна оплата: ${escapeHtml(JSON.stringify(notice.paidAmount))} (заказ ${notice.amount} сом), транзакция Финика <code>${escapeHtml(notice.transactionId)}</code>.\n${order}\n\nПроверить в кабинете Финика и вернуть деньги покупателю.`,
        });
        break;
      case "foreign_account":
        await this.alerts.alert({
          kind: "finik_foreign_account",
          throttle: true,
          html: `🚨 <b>Вебхук Финика об оплате на чужой аккаунт</b> - проигнорирован, сертификат не выдан.\n${order}`,
        });
        break;
      case "order_not_found":
        await this.alerts.alert({
          kind: "finik_order_not_found",
          throttle: true,
          html: `⚠️ <b>Финик прислал оплату по неизвестному заказу</b> (<code>${escapeHtml(JSON.stringify(notice.paymentId)).slice(0, 80)}</code>).\n\nЕсли деньги пришли - проверить в кабинете Финика.`,
        });
        break;
    }
  }

  private async apply(em: EntityManager, rawBody: unknown): Promise<Outcome & { notice?: Notice }> {
    const body = asRecord(rawBody) ?? {};
    const paymentId = asRecord(body.fields)?.paymentId;

    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";
    // Only a successful payment for an unknown order matters (money may have come without one).
    const notFound = (): Outcome & { notice?: Notice } => ({
      result: "order_not_found",
      orderId: null,
      ...(SUCCESS_STATUSES.has(status) ? { notice: { kind: "order_not_found", paymentId } } : {}),
    });

    if (typeof paymentId !== "string" || !UUID.test(paymentId)) {
      return notFound();
    }

    const order = await lockOrder(em, paymentId);

    if (!order) {
      return notFound();
    }

    if (!SUCCESS_STATUSES.has(status)) {
      return { result: `ignored_status: ${String(body.status).slice(0, 100)}`, orderId: order.id };
    }

    // The signature only proves Finik sent it, not that the money came to *our* account: someone
    // with their own Finik account could create a payment there with our order's id as its
    // PaymentId and our webhook URL. The account id is inside the signed body.
    const accountId = asRecord(body.data)?.accountId;

    if (accountId !== this.finik.accountId) {
      this.logger.error(
        `Finik webhook for order ${order.id}: payment to another account (${JSON.stringify(accountId)}) - ignored`,
      );

      return {
        result: "ignored_foreign_account",
        orderId: order.id,
        notice: { kind: "foreign_account" },
      };
    }

    const finikTransactionId = typeof body.id === "string" ? body.id : null;

    // Terminal for the webhook: a duplicate delivery or an order already resolved by hand.
    if (
      order.status === OrderStatus.Paid ||
      order.status === OrderStatus.NeedsReview ||
      order.status === OrderStatus.Refunded
    ) {
      // A retry of the same payment carries the same transaction id. A different one means the
      // buyer was charged a second time - the money must go back, so it can't pass silently.
      if (
        finikTransactionId &&
        order.finikTransactionId &&
        finikTransactionId !== order.finikTransactionId
      ) {
        this.logger.error(
          `Order ${order.id} (${order.status}): second charge, Finik transaction ${finikTransactionId} (first ${order.finikTransactionId})`,
        );

        return {
          result: `duplicate_charge: ${order.status}`,
          orderId: order.id,
          notice: {
            kind: "duplicate_charge",
            status: order.status,
            transactionId: finikTransactionId,
            paidAmount: body.amount,
            amount: order.amount,
          },
        };
      }

      return { result: `already_${order.status}`, orderId: order.id };
    }

    const { paidAt, suspicious } = paidAtFrom(body.transactionDate);

    if (suspicious) {
      this.logger.error(
        `Order ${order.id}: implausible transactionDate ${JSON.stringify(body.transactionDate)} - using now`,
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

      return {
        result: "needs_review: amount_mismatch",
        orderId: order.id,
        notice: { kind: "needs_review", paidAmount: body.amount },
      };
    }

    // An expired order still gets paid: the money has already been taken.
    await payAndIssueCertificate(em, order, { paidAt, finikTransactionId });

    return {
      result: order.status === OrderStatus.Expired ? "paid_after_expiry" : "paid",
      orderId: order.id,
    };
  }
}
