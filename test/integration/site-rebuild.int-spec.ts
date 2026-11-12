import request from "supertest";

import { SiteRebuildService } from "../../src/site/site-rebuild.service";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createUser, createVenue } from "../helpers/factories";

// Whatever changes the website's catalog asks for a rebuild (Vercel Deploy Hook);
// payouts / contact notes and failed requests don't.
describe("website rebuild on catalog changes (integration)", () => {
  let t: TestApp;
  let requestSpy: jest.SpyInstance;

  const http = () => request(t.app.getHttpServer());
  const as = (user: User, req: request.Test) => req.auth(t.tokenFor(user), { type: "bearer" });

  beforeAll(async () => {
    t = await createTestApp();
    requestSpy = jest.spyOn(t.app.get(SiteRebuildService), "request");
  });

  beforeEach(async () => {
    await t.reset();
    requestSpy.mockClear();
  });

  afterAll(async () => {
    requestSpy.mockRestore();
    await t?.close();
  });

  it("an admin's venue edit, the owner's venue edit, a merchant (de)activated, a category → a rebuild", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const owner = await createUser(t.ds, { role: "merchant" });
    const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
    const venue = await createVenue(t.ds, { merchantId: merchant.id });

    await as(admin, http().patch(`/api/admin/venues/${venue.id}`).send({ name: "New" })).expect(
      200,
    );
    await as(
      owner,
      http().patch(`/api/merchants/me/venues/${venue.id}`).send({ name: "Own" }),
    ).expect(200);
    await as(
      admin,
      http().patch(`/api/admin/merchants/${merchant.id}`).send({ isActive: false }),
    ).expect(200);
    await as(
      admin,
      http()
        .post("/api/admin/categories")
        .send({ name: { ru: "Кофе", kg: "Кофе", en: "Coffee" } }),
    ).expect(201);

    expect(requestSpy.mock.calls).toEqual([
      [`venue ${venue.id}`],
      [`venue ${venue.id}`],
      [`merchant ${merchant.id}`],
      ["categories"],
    ]);
  });

  it("a merchant's admin notes or a rejected edit → no rebuild", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const merchant = await createMerchant(t.ds);
    const venue = await createVenue(t.ds, { merchantId: merchant.id });

    await as(
      admin,
      http().patch(`/api/admin/merchants/${merchant.id}`).send({ contact: "@x" }),
    ).expect(200);
    await as(
      admin,
      http()
        .patch(`/api/admin/venues/${venue.id}`)
        .send({ nominals: [7] }),
    ).expect(400);

    expect(requestSpy).not.toHaveBeenCalled();
  });
});
