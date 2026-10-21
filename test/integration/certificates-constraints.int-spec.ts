import type { DataSource } from "typeorm";
import { QueryFailedError } from "typeorm";

import { openTestDataSource, truncateAll } from "../helpers/db";
import { CertificateStatus } from "../../src/certificates/entities/certificate.entity";
import { createCertificate, createVenue, createOrder, createUser } from "../helpers/factories";

const uniqueViolation = (constraint: string) =>
  expect.objectContaining({
    driverError: expect.objectContaining({ code: "23505", constraint }),
  });

describe("certificates DB constraints (integration)", () => {
  let ds: DataSource;
  let base: { venueId: number; ownerUserId: number };
  let orderIds: [string, string];

  beforeAll(async () => {
    ds = await openTestDataSource();
  });

  beforeEach(async () => {
    await truncateAll(ds);

    const user = await createUser(ds);
    const venue = await createVenue(ds);
    const orders = await Promise.all([
      createOrder(ds, { userId: user.id, venueId: venue.id }),
      createOrder(ds, { userId: user.id, venueId: venue.id }),
    ]);

    base = { venueId: venue.id, ownerUserId: user.id };
    orderIds = [orders[0].id, orders[1].id];
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it("rejects a duplicate code", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "11112222" });

    const error = await createCertificate(ds, {
      ...base,
      orderId: orderIds[1],
      code: "11112222",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueryFailedError);
    expect(error).toEqual(uniqueViolation("UQ_e9e6937f74d9a653f0fc3299132"));
  });

  it("rejects a second certificate for the same order", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "11112222" });

    const error = await createCertificate(ds, {
      ...base,
      orderId: orderIds[0],
      code: "22223333",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueryFailedError);
    expect(error).toEqual(uniqueViolation("REL_095ce953d5f237d1eb07c20949"));
  });

  it("accepts distinct codes on distinct orders", async () => {
    await createCertificate(ds, { ...base, orderId: orderIds[0], code: "11112222" });
    await expect(
      createCertificate(ds, { ...base, orderId: orderIds[1], code: "22223333" }),
    ).resolves.toBeDefined();
  });

  describe("used ⇔ usedAt (certificates_used_at_iff_used)", () => {
    const checkViolation = expect.objectContaining({
      driverError: expect.objectContaining({
        code: "23514",
        constraint: "certificates_used_at_iff_used",
      }),
    });

    const insert = (status: CertificateStatus, usedAt: Date | null) =>
      createCertificate(ds, {
        ...base,
        orderId: orderIds[0],
        code: "55552222",
        status,
        usedAt,
      }).catch((e: unknown) => e);

    it("rejects used without usedAt", async () => {
      expect(await insert(CertificateStatus.Used, null)).toEqual(checkViolation);
    });

    it.each([CertificateStatus.Active, CertificateStatus.Expired])(
      "rejects %s with usedAt",
      async (status) => {
        expect(await insert(status, new Date())).toEqual(checkViolation);
      },
    );

    it.each([
      [CertificateStatus.Used, new Date()],
      [CertificateStatus.Active, null],
      [CertificateStatus.Expired, null],
    ])("accepts %s with usedAt=%p", async (status, usedAt) => {
      expect(await insert(status, usedAt)).not.toBeInstanceOf(Error);
    });

    it("also guards UPDATEs: marking used without usedAt fails", async () => {
      const cert = await createCertificate(ds, {
        ...base,
        orderId: orderIds[0],
        code: "66662222",
      });

      const error = await ds
        .query(`UPDATE certificates SET status = 'used' WHERE id = $1`, [cert.id])
        .catch((e: unknown) => e);

      expect(error).toEqual(checkViolation);
    });
  });
});
