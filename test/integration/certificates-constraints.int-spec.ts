import type { DataSource } from "typeorm";
import { QueryFailedError } from "typeorm";

import { openTestDataSource, truncateAll } from "../helpers/db";
import { createCertificate, createMerchant, createOrder, createUser } from "../helpers/factories";

const uniqueViolation = (constraint: string) =>
  expect.objectContaining({
    driverError: expect.objectContaining({ code: "23505", constraint }),
  });

describe("certificates DB constraints (integration)", () => {
  let ds: DataSource;
  let base: { merchantId: number; ownerUserId: number };
  let orderIds: [string, string];

  beforeAll(async () => {
    ds = await openTestDataSource();
  });

  beforeEach(async () => {
    await truncateAll(ds);

    const user = await createUser(ds);
    const merchant = await createMerchant(ds);
    const orders = await Promise.all([
      createOrder(ds, { userId: user.id, merchantId: merchant.id }),
      createOrder(ds, { userId: user.id, merchantId: merchant.id }),
    ]);

    base = { merchantId: merchant.id, ownerUserId: user.id };
    orderIds = [orders[0].id, orders[1].id];
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it("rejects a duplicate code", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "KT-AAAA-2222" });

    const error = await createCertificate(ds, {
      ...base,
      orderId: orderIds[1],
      code: "KT-AAAA-2222",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueryFailedError);
    expect(error).toEqual(uniqueViolation("UQ_e9e6937f74d9a653f0fc3299132"));
  });

  it("rejects a second certificate for the same order", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "KT-AAAA-2222" });

    const error = await createCertificate(ds, {
      ...base,
      orderId: orderIds[0],
      code: "KT-BBBB-3333",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueryFailedError);
    expect(error).toEqual(uniqueViolation("REL_095ce953d5f237d1eb07c20949"));
  });

  it("accepts distinct codes on distinct orders", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "KT-AAAA-2222" });
    await expect(
      createCertificate(ds, { ...base, orderId: orderIds[1], code: "KT-BBBB-3333" }),
    ).resolves.toBeDefined();
  });
});
