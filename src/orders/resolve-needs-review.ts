import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";

import { Order, OrderStatus } from "./entities/order.entity";
import { OrderResolution, OrderResolutionAction } from "./entities/order-resolution.entity";
import { lockOrder, payAndIssueCertificate } from "./order-fulfillment";

export interface ResolveNeedsReviewInput {
  orderId: string;
  action: OrderResolutionAction;
  note?: string;
  resolvedBy: string;
  // The Finik transaction checked in Finik's cabinet - for an order the webhook never reached.
  finikTransactionId?: string;
}

export interface ResolveNeedsReviewResult {
  orderId: string;
  amount: number;
  from: OrderStatus;
  to: OrderStatus;
  paidAt: Date | null;
  certificate: { code: string; validUntil: Date } | null;
}

export class ResolveNeedsReviewError extends Error {}

// Manual decision on an order the money came for, but the system didn't settle:
//  - needs_review: a webhook came, but the paid amount didn't match;
//  - expired / pending: Finik took the money, but its webhook never reached us (an outage, a
//    bad signature, Finik gave up after a day) - found in Finik's cabinet. A note naming the
//    checked transaction is required here: nothing in our data proves the payment.
// Actions:
//  - issue:    honour it - paid + the certificate, through the same code as the webhook;
//  - refunded: the money was returned outside the system (Finik has no refund API).
// One transaction with the order row locked, so it can't race a late webhook retry.
// paid / refunded → error, nothing changes.
export const resolveNeedsReview = (
  ds: DataSource,
  input: ResolveNeedsReviewInput,
): Promise<ResolveNeedsReviewResult> =>
  ds.transaction(async (em) => {
    const order = await lockOrder(em, input.orderId);

    if (!order) {
      throw new ResolveNeedsReviewError(`Order ${input.orderId} not found`);
    }

    const lostWebhook =
      order.status === OrderStatus.Expired || order.status === OrderStatus.Pending;

    if (order.status !== OrderStatus.NeedsReview && !lostWebhook) {
      throw new ResolveNeedsReviewError(
        `Order ${order.id} is "${order.status}" - only needs_review, expired or pending can be resolved; nothing changed`,
      );
    }

    if (lostWebhook && !input.note?.trim()) {
      throw new ResolveNeedsReviewError(
        `Order ${order.id} is "${order.status}": add --note with the Finik transaction you checked in Finik's cabinet`,
      );
    }

    let certificate: ResolveNeedsReviewResult["certificate"] = null;
    let paidAt = order.paidAt;
    let to: OrderStatus;

    if (input.action === OrderResolutionAction.Issue) {
      // The payment already happened: keep its paidAt (older needs_review rows and a lost webhook
      // have none - then now, which also starts the certificate's validity from today).
      paidAt = order.paidAt ?? new Date();
      certificate = await payAndIssueCertificate(em, order, {
        paidAt,
        ...(input.finikTransactionId ? { finikTransactionId: input.finikTransactionId } : {}),
      });
      to = OrderStatus.Paid;
    } else {
      await em.update(Order, order.id, { status: OrderStatus.Refunded });
      to = OrderStatus.Refunded;
    }

    await em.insert(OrderResolution, {
      id: randomUUID(),
      orderId: order.id,
      action: input.action,
      fromStatus: order.status,
      toStatus: to,
      certificateCode: certificate?.code ?? null,
      note: input.note?.trim() || null,
      resolvedBy: input.resolvedBy,
    });

    return { orderId: order.id, amount: order.amount, from: order.status, to, paidAt, certificate };
  });
