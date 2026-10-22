import request from "supertest";

import {
  CertificateStatus,
  type Certificate,
} from "../../src/certificates/entities/certificate.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { OrderStatus } from "../../src/orders/entities/order.entity";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createCertificate, createVenue, createOrder, createUser } from "../helpers/factories";

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 30 * DAY);
const past = () => new Date(Date.now() - DAY);

describe("GET /api/certificates/my (integration)", () => {
  let t: TestApp;
  let codeSeq = 0;

  const http = () => request(t.app.getHttpServer());
  const getMine = (user: User) =>
    http().get("/api/certificates/my").auth(t.tokenFor(user), { type: "bearer" }).expect(200);

  // A paid order + its certificate; createdAt is set explicitly so ordering is deterministic.
  const issue = async (
    owner: User,
    venue: Venue,
    fields: Partial<Certificate> & { createdAt?: Date } = {},
  ): Promise<Certificate> => {
    const order = await createOrder(t.ds, {
      userId: owner.id,
      venueId: venue.id,
      status: OrderStatus.Paid,
      paidAt: new Date(),
    });
    const { createdAt, ...rest } = fields;
    const cert = await createCertificate(t.ds, {
      orderId: order.id,
      venueId: venue.id,
      ownerUserId: owner.id,
      code: String(30_000_000 + ++codeSeq),
      validUntil: future(),
      ...rest,
    });

    if (createdAt) {
      await t.ds.query(`UPDATE certificates SET "createdAt" = $1 WHERE id = $2`, [
        createdAt,
        cert.id,
      ]);
    }

    return cert;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("401 without a JWT", async () => {
    await http().get("/api/certificates/my").expect(401);
  });

  it("[] when the user has none", async () => {
    const user = await createUser(t.ds);

    expect((await getMine(user)).body).toEqual([]);
  });

  it("returns exactly the contract shape for an active certificate", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds);
    const cert = await issue(user, venue, { amount: 2000 });

    const [item] = (await getMine(user)).body;

    expect(item).toEqual({
      id: cert.id,
      code: cert.code,
      amount: 2000,
      status: "active",
      validUntil: cert.validUntil.toISOString(),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      venue: { id: venue.id, name: venue.name, slug: venue.slug, logo: venue.logo },
    });
    expect(item).not.toHaveProperty("usedAt");
  });

  it("shows only the caller's certificates", async () => {
    const [alice, bob] = [await createUser(t.ds), await createUser(t.ds)];
    const venue = await createVenue(t.ds);
    const mine = await issue(alice, venue);

    await issue(bob, venue);
    await issue(bob, venue);

    expect((await getMine(alice)).body.map((c: { id: string }) => c.id)).toEqual([mine.id]);
    expect((await getMine(bob)).body).toHaveLength(2);
  });

  it("effective status: active past validUntil → expired; used stays used even past validUntil", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds);
    const usedAt = new Date(Date.now() - 2 * DAY);

    const valid = await issue(user, venue, { validUntil: future() });
    const lapsed = await issue(user, venue, { validUntil: past() });
    const used = await issue(user, venue, {
      status: CertificateStatus.Used,
      usedAt,
      validUntil: past(),
    });
    const expiredInDb = await issue(user, venue, { status: CertificateStatus.Expired });

    const byId = new Map<string, Record<string, unknown>>(
      (await getMine(user)).body.map((c: { id: string }) => [c.id, c]),
    );

    expect(byId.get(valid.id)).toMatchObject({ status: "active" });
    expect(byId.get(lapsed.id)).toMatchObject({ status: "expired" });
    expect(byId.get(used.id)).toMatchObject({ status: "used", usedAt: usedAt.toISOString() });
    expect(byId.get(expiredInDb.id)).toMatchObject({ status: "expired" });

    for (const id of [valid.id, lapsed.id, expiredInDb.id]) {
      expect(byId.get(id)).not.toHaveProperty("usedAt");
    }

    // Computed on read only — the stored status is untouched.
    const [{ status }] = await t.ds.query(`SELECT status FROM certificates WHERE id = $1`, [
      lapsed.id,
    ]);

    expect(status).toBe("active");
  });

  it("sorts active first (by effective status), each group newest first", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds);
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);

    const oldActive = await issue(user, venue, { createdAt: at(10) });
    const newActive = await issue(user, venue, { createdAt: at(1) });
    const newestLapsed = await issue(user, venue, { createdAt: at(0.5), validUntil: past() });
    const oldUsed = await issue(user, venue, {
      createdAt: at(20),
      status: CertificateStatus.Used,
      usedAt: at(15),
    });
    const midExpired = await issue(user, venue, {
      createdAt: at(5),
      status: CertificateStatus.Expired,
    });

    const ids = (await getMine(user)).body.map((c: { id: string }) => c.id);

    // The newest certificate overall is lapsed, so it must NOT come before the active ones.
    expect(ids).toEqual([newActive.id, oldActive.id, newestLapsed.id, midExpired.id, oldUsed.id]);
  });

  it("includes certificates of a venue that was deactivated later", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds, { isActive: false });

    await issue(user, venue);

    expect((await getMine(user)).body).toHaveLength(1);
  });
});
