import type { DataSource } from "typeorm";

import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import { certificateValidUntil } from "../../src/common/utils/valid-until";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import {
  OrderResolution,
  OrderResolutionAction,
} from "../../src/orders/entities/order-resolution.entity";
import { resolveNeedsReview, ResolveNeedsReviewError } from "../../src/orders/resolve-needs-review";
import { openTestDataSource, truncateAll } from "../helpers/db";
import { createVenue, createOrder, createUser } from "../helpers/factories";

const CODE = /^[0-9]{8}$/;
const PAID_AT = new Date("2026-10-20T08:30:00.000Z");

describe("resolveNeedsReview (integration)", () => {
  let ds: DataSource;

  const reload = (id: string) => ds.getRepository(Order).findOneByOrFail({ id });
  const certificates = () => ds.getRepository(Certificate);
  const resolutions = () => ds.getRepository(OrderResolution);

  const setup = async (status = OrderStatus.NeedsReview, paidAt: Date | null = PAID_AT) => {
    const user = await createUser(ds);
    const venue = await createVenue(ds, { validityMonths: 6 });
    const order = await createOrder(ds, {
      userId: user.id,
      venueId: venue.id,
      amount: 1000,
      status,
      paidAt,
      finikTransactionId: status === OrderStatus.Pending ? null : `txn-${Math.random()}`,
    });

    return { user, venue, order };
  };

  beforeAll(async () => {
    ds = await openTestDataSource();
  });

  beforeEach(async () => {
    await truncateAll(ds);
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  describe("--issue", () => {
    it("→ paid + exactly one valid certificate; paidAt and finikTransactionId kept; trail written", async () => {
      const { user, venue, order } = await setup();

      const result = await resolveNeedsReview(ds, {
        orderId: order.id,
        action: OrderResolutionAction.Issue,
        note: "Finik cabinet shows 1000 KGS - amount field was wrong in the webhook",
        resolvedBy: "alisher",
      });

      expect(result).toMatchObject({
        orderId: order.id,
        amount: 1000,
        from: "needs_review",
        to: "paid",
        paidAt: PAID_AT,
        certificate: { code: expect.stringMatching(CODE) },
      });
      expect(await reload(order.id)).toMatchObject({
        status: OrderStatus.Paid,
        paidAt: PAID_AT,
        finikTransactionId: order.finikTransactionId,
      });

      const certs = await certificates().find();

      expect(certs).toHaveLength(1);
      expect(certs[0]).toMatchObject({
        orderId: order.id,
        venueId: venue.id,
        ownerUserId: user.id,
        amount: 1000,
        status: CertificateStatus.Active,
        usedAt: null, // certificates_used_at_iff_used holds
        code: result.certificate!.code,
      });
      // Same rule as the webhook: paidAt + venue.validityMonths.
      expect(certs[0].validUntil).toEqual(certificateValidUntil(PAID_AT, 6));

      expect(await resolutions().find()).toEqual([
        expect.objectContaining({
          orderId: order.id,
          action: OrderResolutionAction.Issue,
          fromStatus: "needs_review",
          toStatus: "paid",
          certificateCode: result.certificate!.code,
          note: "Finik cabinet shows 1000 KGS - amount field was wrong in the webhook",
          resolvedBy: "alisher",
          resolvedAt: expect.any(Date),
        }),
      ]);
    });

    it("an older needs_review without paidAt gets paidAt = now", async () => {
      const { order } = await setup(OrderStatus.NeedsReview, null);
      const before = Date.now();

      const result = await resolveNeedsReview(ds, {
        orderId: order.id,
        action: OrderResolutionAction.Issue,
        resolvedBy: "alisher",
      });

      expect(result.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect((await reload(order.id)).paidAt).toEqual(result.paidAt);
    });

    it("running it twice: the second run refuses, still one certificate", async () => {
      const { order } = await setup();
      const run = () =>
        resolveNeedsReview(ds, {
          orderId: order.id,
          action: OrderResolutionAction.Issue,
          resolvedBy: "alisher",
        });

      await run();
      await expect(run()).rejects.toThrow(/is "paid" - only needs_review, expired or pending/);

      expect(await certificates().count()).toBe(1);
      expect(await resolutions().count()).toBe(1);
    });
  });

  describe("--refunded", () => {
    it("→ refunded, no certificate, trail written; an empty note is stored as null", async () => {
      const { order } = await setup();

      const result = await resolveNeedsReview(ds, {
        orderId: order.id,
        action: OrderResolutionAction.Refunded,
        note: "   ",
        resolvedBy: "alisher",
      });

      expect(result).toMatchObject({ from: "needs_review", to: "refunded", certificate: null });
      expect((await reload(order.id)).status).toBe(OrderStatus.Refunded);
      expect(await certificates().count()).toBe(0);
      expect(await resolutions().find()).toEqual([
        expect.objectContaining({
          action: OrderResolutionAction.Refunded,
          fromStatus: "needs_review",
          toStatus: "refunded",
          certificateCode: null,
          note: null,
        }),
      ]);
    });
  });

  describe("a lost webhook: expired / pending with the money found in Finik's cabinet", () => {
    it.each([OrderStatus.Expired, OrderStatus.Pending])(
      "%s + issue with a note → paid + certificate, paidAt = now, the Finik transaction stored",
      async (status) => {
        const { order } = await setup(status, null);
        const before = Date.now();

        const result = await resolveNeedsReview(ds, {
          orderId: order.id,
          action: OrderResolutionAction.Issue,
          note: "Finik cabinet: 1000 KGS",
          finikTransactionId: "txn-from-cabinet",
          resolvedBy: "alisher",
        });

        expect(result).toMatchObject({ from: status, to: OrderStatus.Paid });
        expect(result.certificate?.code).toMatch(CODE);
        expect(result.paidAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(await reload(order.id)).toMatchObject({
          status: OrderStatus.Paid,
          finikTransactionId: "txn-from-cabinet",
        });
        expect(await resolutions().findOneByOrFail({ orderId: order.id })).toMatchObject({
          fromStatus: status,
          toStatus: OrderStatus.Paid,
          note: "Finik cabinet: 1000 KGS",
        });
      },
    );

    it("expired + refunded with a note → refunded", async () => {
      const { order } = await setup(OrderStatus.Expired, null);

      await resolveNeedsReview(ds, {
        orderId: order.id,
        action: OrderResolutionAction.Refunded,
        note: "returned by bank transfer",
        resolvedBy: "alisher",
      });

      expect((await reload(order.id)).status).toBe(OrderStatus.Refunded);
      expect(await certificates().count()).toBe(0);
    });

    it.each([undefined, "   "])("without a note (%p) → refused, nothing changes", async (note) => {
      const { order } = await setup(OrderStatus.Expired, null);

      await expect(
        resolveNeedsReview(ds, {
          orderId: order.id,
          action: OrderResolutionAction.Issue,
          note,
          resolvedBy: "alisher",
        }),
      ).rejects.toThrow(/add --note with the Finik transaction/);
      expect((await reload(order.id)).status).toBe(OrderStatus.Expired);
      expect(await certificates().count()).toBe(0);
    });
  });

  describe("refuses paid and refunded - nothing changes", () => {
    it.each([
      [OrderStatus.Paid, OrderResolutionAction.Issue],
      [OrderStatus.Paid, OrderResolutionAction.Refunded],
      [OrderStatus.Refunded, OrderResolutionAction.Issue],
      [OrderStatus.Refunded, OrderResolutionAction.Refunded],
    ])("%s + %s", async (status, action) => {
      const { order } = await setup(status, status === OrderStatus.Paid ? PAID_AT : null);

      const error = await resolveNeedsReview(ds, {
        orderId: order.id,
        action,
        note: "a note does not help",
        resolvedBy: "alisher",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ResolveNeedsReviewError);
      expect((error as Error).message).toContain(`is "${status}" - only needs_review`);
      expect((await reload(order.id)).status).toBe(status);
      expect(await certificates().count()).toBe(0);
      expect(await resolutions().count()).toBe(0);
    });

    it("an unknown order", async () => {
      await expect(
        resolveNeedsReview(ds, {
          orderId: "00000000-0000-4000-8000-000000000000",
          action: OrderResolutionAction.Issue,
          resolvedBy: "alisher",
        }),
      ).rejects.toThrow(/not found/);
    });
  });
});
