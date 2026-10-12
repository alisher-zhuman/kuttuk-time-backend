import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";

import { User } from "../../src/users/entities/user.entity";
import { Merchant } from "../../src/merchants/entities/merchant.entity";
import { Order, OrderStatus } from "../../src/orders/entities/order.entity";
import { Certificate, CertificateStatus } from "../../src/certificates/entities/certificate.entity";

let seq = 0;
const next = () => ++seq;

export const createUser = (ds: DataSource, overrides: Partial<User> = {}): Promise<User> =>
  ds.getRepository(User).save({ telegramId: 7_000_000_000 + next(), role: "user", ...overrides });

export const createMerchant = (
  ds: DataSource,
  overrides: Partial<Merchant> = {},
): Promise<Merchant> => {
  const n = next();

  return ds.getRepository(Merchant).save({
    name: `Test Merchant ${n}`,
    description: { ru: "Тест", kg: "Тест", en: "Test" },
    categories: [],
    nominals: [500, 1000, 2000],
    validityMonths: 12,
    merchantTelegramId: 8_000_000_000 + n,
    logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/test.webp",
    slug: `test-merchant-${n}`,
    isActive: true,
    ...overrides,
  });
};

export const createOrder = (
  ds: DataSource,
  fields: Pick<Order, "userId" | "merchantId"> & Partial<Order>,
): Promise<Order> =>
  ds.getRepository(Order).save({
    id: randomUUID(),
    amount: 1000,
    status: OrderStatus.Pending,
    paymentUrl: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    paidAt: null,
    ...fields,
  });

export const createCertificate = (
  ds: DataSource,
  fields: Pick<Certificate, "orderId" | "merchantId" | "ownerUserId" | "code"> &
    Partial<Certificate>,
): Promise<Certificate> =>
  ds.getRepository(Certificate).save({
    id: randomUUID(),
    amount: 1000,
    status: CertificateStatus.Active,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    usedAt: null,
    ...fields,
  });
