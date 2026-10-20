import {
  BadGatewayException,
  BadRequestException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { ORDER_TTL_MS, OrdersService } from "./orders.service";
import { Order, OrderStatus } from "./entities/order.entity";
import { Certificate } from "@/certificates/entities/certificate.entity";
import { Venue } from "@/venues/entities/venue.entity";
import type { Merchant } from "@/merchants/entities/merchant.entity";
import { FinikService } from "@/finik/finik.service";
import { finikConfig } from "@/finik/finik.config";
import { FinikApiError, FinikNetworkError, FinikTimeoutError } from "@/finik/finik.errors";

const USER_ID = 7;
const NOW = new Date("2026-10-12T10:00:00.000Z");

// Venue 9 "Sierra Coffee" owned by merchant 4.
const venue = (overrides: Partial<Venue> = {}, merchant: Partial<Merchant> = {}): Venue =>
  ({
    id: 9,
    merchantId: 4,
    merchant: { id: 4, isActive: true, ...merchant } as Merchant,
    name: "Sierra Coffee",
    nominals: [500, 1000, 2000],
    validityMonths: 12,
    isActive: true,
    ...overrides,
  }) as Venue;

describe("OrdersService", () => {
  let service: OrdersService;

  const orderRepo = {
    create: jest.fn((data: Partial<Order>) => data),
    save: jest.fn(async (data: Partial<Order>) => data),
    update: jest.fn(async () => ({ affected: 1 })),
    findOne: jest.fn(),
  };
  const certificateRepo = { findOne: jest.fn() };
  const venueRepo = { findOne: jest.fn() };
  const finikService = { createPayment: jest.fn() };

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Certificate), useValue: certificateRepo },
        { provide: getRepositoryToken(Venue), useValue: venueRepo },
        { provide: FinikService, useValue: finikService },
        {
          provide: finikConfig.KEY,
          useValue: {
            redirectUrl: "https://t.me/kuttuk_time_bot/app",
            webhookUrl: "https://kuttuk-time.koyeb.app/api/finik/webhook",
          },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("create", () => {
    it("creates a pending order, a Finik payment and returns the payment URL", async () => {
      venueRepo.findOne.mockResolvedValue(venue());
      finikService.createPayment.mockResolvedValue({ paymentUrl: "https://pay.finik.kg/qr/abc" });

      const result = await service.create(USER_ID, { venueId: 9, nominal: 1000 });

      const saved = orderRepo.save.mock.calls[0][0] as Order;
      const expiresAt = new Date(NOW.getTime() + ORDER_TTL_MS);

      expect(saved).toMatchObject({
        userId: USER_ID,
        venueId: 9,
        merchantId: 4, // owner snapshot
        amount: 1000,
        status: OrderStatus.Pending,
        expiresAt,
      });
      expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);

      expect(finikService.createPayment).toHaveBeenCalledWith({
        paymentId: saved.id,
        amount: 1000,
        nameEn: "Sierra Coffee",
        description: "Sierra Coffee — 1000 KGS",
        lang: "ru",
        endDate: expiresAt.getTime(),
        // Our own return endpoint (on the webhook URL's origin), not t.me directly.
        redirectUrl: `https://kuttuk-time.koyeb.app/api/payments/return/${saved.id}`,
      });
      expect(orderRepo.update).toHaveBeenCalledWith(saved.id, {
        paymentUrl: "https://pay.finik.kg/qr/abc",
      });
      expect(result).toEqual({
        orderId: saved.id,
        paymentUrl: "https://pay.finik.kg/qr/abc",
        expiresAt,
      });
    });

    it("rejects a nominal the venue does not offer, without touching orders or Finik", async () => {
      venueRepo.findOne.mockResolvedValue(venue());

      await expect(service.create(USER_ID, { venueId: 9, nominal: 1500 })).rejects.toThrow(
        BadRequestException,
      );
      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(finikService.createPayment).not.toHaveBeenCalled();
    });

    it.each([
      ["an inactive venue", venue({ isActive: false })],
      ["a venue of an inactive merchant", venue({}, { isActive: false })],
    ])("rejects %s", async (_name, found) => {
      venueRepo.findOne.mockResolvedValue(found);

      await expect(service.create(USER_ID, { venueId: 9, nominal: 1000 })).rejects.toThrow(
        BadRequestException,
      );
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a missing venue", async () => {
      venueRepo.findOne.mockResolvedValue(null);

      await expect(service.create(USER_ID, { venueId: 404, nominal: 1000 })).rejects.toThrow(
        BadRequestException,
      );
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it.each([
      ["api error", new FinikApiError(401, "Unauthorized: bad x-api-key k-123")],
      ["network error", new FinikNetworkError("Finik request failed: fetch failed")],
      ["timeout", new FinikTimeoutError(15_000)],
    ])(
      "on Finik %s: expires the order and returns 502 without Finik details",
      async (_name, error) => {
        venueRepo.findOne.mockResolvedValue(venue());
        finikService.createPayment.mockRejectedValue(error);

        const thrown = await service
          .create(USER_ID, { venueId: 9, nominal: 1000 })
          .catch((e: unknown) => e);

        const saved = orderRepo.save.mock.calls[0][0] as Order;

        expect(thrown).toBeInstanceOf(BadGatewayException);
        expect((thrown as Error).message).not.toContain(error.message);
        expect(orderRepo.update).toHaveBeenCalledWith(
          { id: saved.id, status: OrderStatus.Pending },
          { status: OrderStatus.Expired },
        );
        expect(orderRepo.update).not.toHaveBeenCalledWith(saved.id, expect.anything());
      },
    );

    it("rethrows unexpected errors as-is (a bug, not a provider outage), still expiring the order", async () => {
      venueRepo.findOne.mockResolvedValue(venue());
      finikService.createPayment.mockRejectedValue(new Error("Finik: nameEn is required"));

      await expect(service.create(USER_ID, { venueId: 9, nominal: 1000 })).rejects.toThrow(
        "Finik: nameEn is required",
      );
      expect(orderRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.Pending }),
        { status: OrderStatus.Expired },
      );
    });
  });

  describe("findOwn", () => {
    const order = (overrides: Partial<Order> = {}): Order =>
      ({
        id: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10",
        userId: USER_ID,
        venueId: 9,
        merchantId: 4,
        amount: 1000,
        status: OrderStatus.Pending,
        paymentUrl: "https://pay.finik.kg/qr/abc",
        expiresAt: new Date(NOW.getTime() + ORDER_TTL_MS),
        paidAt: null,
        ...overrides,
      }) as Order;

    it("queries by id AND owner, so someone else's order is a 404", async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.findOwn(99, "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10")).rejects.toThrow(
        NotFoundException,
      );
      expect(orderRepo.findOne).toHaveBeenCalledWith({
        where: { id: "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10", userId: 99 },
      });
    });

    it("returns a pending order with its payment URL and no certificate", async () => {
      orderRepo.findOne.mockResolvedValue(order());

      const view = await service.findOwn(USER_ID, order().id);

      expect(view).toMatchObject({
        status: "pending",
        paymentUrl: "https://pay.finik.kg/qr/abc",
        certificate: null,
      });
      expect(certificateRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns the certificate code for a paid order and hides the payment URL", async () => {
      const paidAt = new Date("2026-10-12T10:05:00.000Z");
      const validUntil = new Date("2027-10-12T10:05:00.000Z");

      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.Paid, paidAt }));
      certificateRepo.findOne.mockResolvedValue({ code: "KT-7F3A-9B2C", validUntil });

      const view = await service.findOwn(USER_ID, order().id);

      expect(view).toMatchObject({
        status: "paid",
        paidAt,
        paymentUrl: null,
        certificate: { code: "KT-7F3A-9B2C", validUntil },
      });
    });

    it("returns an expired order without a payment URL", async () => {
      orderRepo.findOne.mockResolvedValue(order({ status: OrderStatus.Expired }));

      await expect(service.findOwn(USER_ID, order().id)).resolves.toMatchObject({
        status: "expired",
        paymentUrl: null,
        certificate: null,
      });
    });
  });

  describe("expireStale", () => {
    it("expires only pending orders whose expiresAt has passed", async () => {
      orderRepo.update.mockResolvedValue({ affected: 3 });

      await expect(service.expireStale()).resolves.toBe(3);

      const [where, patch] = orderRepo.update.mock.calls[0] as unknown as [
        { status: OrderStatus; expiresAt: { _type: string; _value: Date } },
        Partial<Order>,
      ];

      expect(where.status).toBe(OrderStatus.Pending);
      expect(where.expiresAt._type).toBe("lessThan");
      expect(where.expiresAt._value).toEqual(NOW);
      expect(patch).toEqual({ status: OrderStatus.Expired });
    });
  });
});
