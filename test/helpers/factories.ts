import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";

import { User } from "../../src/users/entities/user.entity";
import { Merchant } from "../../src/merchants/entities/merchant.entity";
import { Venue } from "../../src/venues/entities/venue.entity";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";

let seq = 0;
const next = () => ++seq;

export const createUser = (ds: DataSource, overrides: Partial<User> = {}): Promise<User> =>
  ds.getRepository(User).save({ telegramId: 7_000_000_000 + next(), role: "user", ...overrides });

// A business account only (no venue).
export const createMerchant = (
  ds: DataSource,
  overrides: Partial<Merchant> = {},
): Promise<Merchant> => {
  const n = next();

  return ds.getRepository(Merchant).save({
    name: `Test Merchant ${n}`,
    telegramId: 8_000_000_000 + n,
    isActive: true,
    ...overrides,
  });
};

// A storefront; without a merchantId it gets a fresh merchant of its own.
export const createVenue = async (
  ds: DataSource,
  overrides: Partial<Venue> = {},
): Promise<Venue> => {
  const n = next();
  const merchantId = overrides.merchantId ?? (await createMerchant(ds)).id;

  return ds.getRepository(Venue).save({
    name: `Test Venue ${n}`,
    description: { ru: "Тест", kg: "Тест", en: "Test" },
    categories: [],
    nominals: [500, 1000, 2000],
    validityMonths: 12,
    logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/test.webp",
    slug: `test-venue-${n}`,
    isActive: true,
    ...overrides,
    merchantId,
  });
};

// merchantId (the owner snapshot) defaults to the venue's current merchant.
export const createOrder = async (
  ds: DataSource,
  fields: Pick<Order, "userId" | "venueId"> & Partial<Order>,
): Promise<Order> => {
  const merchantId =
    fields.merchantId ??
    (await ds.getRepository(Venue).findOneByOrFail({ id: fields.venueId })).merchantId;

  return ds.getRepository(Order).save({
    id: randomUUID(),
    amount: 1000,
    status: OrderStatus.Pending,
    paymentUrl: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    paidAt: null,
    ...fields,
    merchantId,
  });
};

export const createCertificate = (
  ds: DataSource,
  fields: Pick<Certificate, "orderId" | "venueId" | "ownerUserId" | "code"> & Partial<Certificate>,
): Promise<Certificate> =>
  ds.getRepository(Certificate).save({
    id: randomUUID(),
    amount: 1000,
    status: CertificateStatus.Active,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    usedAt: null,
    ...fields,
  });
