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

// Manual decision on a needs_review order (a webhook came, but the paid amount didn't match):
//  - issue:    honour it — paid + the certificate, through the same code as the webhook;
//  - refunded: the money was returned outside the system (Finik has no refund API).
// One transaction with the order row locked, so it can't race a late webhook retry.
// Anything but needs_review → error, nothing changes.
export const resolveNeedsReview = (
  ds: DataSource,
  input: ResolveNeedsReviewInput,
): Promise<ResolveNeedsReviewResult> =>
  ds.transaction(async (em) => {
    const order = await lockOrder(em, input.orderId);

    if (!order) {
      throw new ResolveNeedsReviewError(`Order ${input.orderId} not found`);
    }

    if (order.status !== OrderStatus.NeedsReview) {
      throw new ResolveNeedsReviewError(
        `Order ${order.id} is "${order.status}", not "needs_review" — nothing changed`,
      );
    }

    let certificate: ResolveNeedsReviewResult["certificate"] = null;
    let paidAt = order.paidAt;
    let to: OrderStatus;

    if (input.action === OrderResolutionAction.Issue) {
      // The payment already happened: keep its paidAt (older needs_review rows may lack it).
      paidAt = order.paidAt ?? new Date();
      certificate = await payAndIssueCertificate(em, order, { paidAt });
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
