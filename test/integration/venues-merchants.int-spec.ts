import request from "supertest";

import { Venue } from "../../src/venues/entities/venue.entity";
import type { Merchant } from "../../src/merchants/entities/merchant.entity";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createUser, createVenue, createCategory } from "../helpers/factories";

const DESCRIPTION = { ru: "Кофе", kg: "Кофе", en: "Coffee" };

describe("venues & merchants API (integration)", () => {
  let t: TestApp;
  let owner: User;
  let merchant: Merchant;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());
  const as = (user: User, req: request.Test) => req.auth(t.tokenFor(user), { type: "bearer" });
  const stored = (id: number) => t.ds.getRepository(Venue).findOneByOrFail({ id });

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    owner = await createUser(t.ds, { role: "merchant" });
    merchant = await createMerchant(t.ds, { telegramId: owner.telegramId, name: "Coffee LLC" });
    venue = await createVenue(t.ds, { merchantId: merchant.id, name: "Coffee Shop" });
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("buyer storefront", () => {
    it("shows a venue only while it and its merchant are both active (list, by id, by slug)", async () => {
      const buyer = await createUser(t.ds);
      const hiddenVenue = await createVenue(t.ds, { isActive: false });
      const offMerchant = await createMerchant(t.ds, { isActive: false });
      const ofHiddenMerchant = await createVenue(t.ds, { merchantId: offMerchant.id });

      const list = await as(buyer, http().get("/api/venues")).expect(200);

      expect(list.body.map((v: { id: number }) => v.id)).toEqual([venue.id]);

      for (const hidden of [hiddenVenue, ofHiddenMerchant]) {
        await as(buyer, http().get(`/api/venues/${hidden.id}`)).expect(404);
        await as(buyer, http().get(`/api/venues/${hidden.slug}`)).expect(404);
      }

      expect((await as(buyer, http().get(`/api/venues/${venue.slug}`)).expect(200)).body).toEqual({
        id: venue.id,
        name: "Coffee Shop",
        description: "Тест",
        logo: venue.logo,
        nominals: venue.nominals,
        validityMonths: venue.validityMonths,
      });
    });
  });

  describe("owner: /api/merchants/me", () => {
    it("GET → the account and all its venues, inactive ones included", async () => {
      const second = await createVenue(t.ds, { merchantId: merchant.id, isActive: false });

      await createVenue(t.ds); // someone else's

      const res = await as(owner, http().get("/api/merchants/me")).expect(200);

      expect(res.body).toMatchObject({ id: merchant.id, name: "Coffee LLC", isActive: true });
      expect(res.body.venues.map((v: { id: number }) => v.id)).toEqual([venue.id, second.id]);
      expect(res.body.venues[0]).toEqual({
        id: venue.id,
        name: "Coffee Shop",
        description: venue.description,
        categories: [],
        nominals: venue.nominals,
        validityMonths: venue.validityMonths,
        logo: venue.logo,
        slug: venue.slug,
        isActive: true,
        createdAt: expect.any(String),
      });
    });

    it("GET 404 without a merchant account, 403 for a buyer", async () => {
      await as(
        await createUser(t.ds, { role: "merchant" }),
        http().get("/api/merchants/me"),
      ).expect(404);
      await as(await createUser(t.ds), http().get("/api/merchants/me")).expect(403);
    });

    it("PATCH venues/:id: a partial update answers with the whole venue", async () => {
      const res = await as(owner, http().patch(`/api/merchants/me/venues/${venue.id}`))
        .send({ validityMonths: 6 })
        .expect(200);

      // Regression: omitted DTO fields used to blank the response (DB was fine).
      expect(res.body).toMatchObject({
        id: venue.id,
        name: "Coffee Shop",
        description: venue.description,
        nominals: venue.nominals,
        logo: venue.logo,
        validityMonths: 6,
      });
      expect((await stored(venue.id)).validityMonths).toBe(6);
    });

    it("PATCH ignores admin-only fields (slug, isActive, merchantId)", async () => {
      const other = await createMerchant(t.ds);

      await as(owner, http().patch(`/api/merchants/me/venues/${venue.id}`))
        .send({ slug: "taken-over", isActive: false, merchantId: other.id, name: "Renamed" })
        .expect(200);

      expect(await stored(venue.id)).toMatchObject({
        name: "Renamed",
        slug: venue.slug,
        isActive: true,
        merchantId: merchant.id,
      });
    });

    it("PATCH another merchant's venue → 404, unchanged", async () => {
      const foreign = await createVenue(t.ds);

      await as(owner, http().patch(`/api/merchants/me/venues/${foreign.id}`))
        .send({ name: "Mine now" })
        .expect(404);
      expect((await stored(foreign.id)).name).toBe(foreign.name);
    });

    it("PATCH → 403 while the merchant is deactivated (GET still works)", async () => {
      await t.ds.query(`UPDATE merchants SET "isActive" = false WHERE id = $1`, [merchant.id]);

      await as(owner, http().patch(`/api/merchants/me/venues/${venue.id}`))
        .send({ name: "X" })
        .expect(403);
      expect((await as(owner, http().get("/api/merchants/me")).expect(200)).body.isActive).toBe(
        false,
      );
    });
  });

  describe("admin", () => {
    let admin: User;

    beforeEach(async () => {
      admin = await createUser(t.ds, { role: "admin" });
    });

    it("merchants: create, detail with venues, update; telegramId is unique", async () => {
      const created = await as(admin, http().post("/api/admin/merchants"))
        .send({ name: "Chain", telegramId: 8_300_000_001 })
        .expect(201);

      expect(created.body).toMatchObject({
        name: "Chain",
        telegramId: 8_300_000_001,
        isActive: true,
      });

      await as(admin, http().post("/api/admin/merchants"))
        .send({ name: "Dup", telegramId: 8_300_000_001 })
        .expect(409);

      const updated = await as(admin, http().patch(`/api/admin/merchants/${created.body.id}`))
        .send({ isActive: false })
        .expect(200);

      expect(updated.body).toMatchObject({
        name: "Chain",
        telegramId: 8_300_000_001,
        isActive: false,
      });

      const detail = await as(admin, http().get(`/api/admin/merchants/${merchant.id}`)).expect(200);

      expect(detail.body).toMatchObject({ id: merchant.id, telegramId: owner.telegramId });
      expect(detail.body.venues.map((v: { id: number }) => v.id)).toEqual([venue.id]);
    });

    it("venues: create for a merchant (unknown merchant → 400), filter by merchantId", async () => {
      const body = {
        name: "Second Shop",
        description: DESCRIPTION,
        categories: [(await createCategory(t.ds)).id],
        nominals: [500],
        validityMonths: 12,
        logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/x.webp",
        slug: "second-shop",
      };

      await as(admin, http().post("/api/admin/venues"))
        .send({ ...body, merchantId: 999_999 })
        .expect(400);

      const created = await as(admin, http().post("/api/admin/venues"))
        .send({ ...body, merchantId: merchant.id })
        .expect(201);

      expect(created.body).toMatchObject({ name: "Second Shop", merchantId: merchant.id });

      await createVenue(t.ds); // another merchant's

      const list = await as(
        admin,
        http().get(`/api/admin/venues?merchantId=${merchant.id}`),
      ).expect(200);

      expect(list.body.map((v: { id: number }) => v.id)).toEqual([venue.id, created.body.id]);
    });

    it("venues: moving one to another merchant — the new owner sees it, the old one doesn't", async () => {
      const newOwner = await createUser(t.ds, { role: "merchant" });
      const newMerchant = await createMerchant(t.ds, { telegramId: newOwner.telegramId });

      await as(admin, http().patch(`/api/admin/venues/${venue.id}`))
        .send({ merchantId: 999_999 })
        .expect(400);

      const res = await as(admin, http().patch(`/api/admin/venues/${venue.id}`))
        .send({ merchantId: newMerchant.id })
        .expect(200);

      expect(res.body).toMatchObject({ name: "Coffee Shop", merchantId: newMerchant.id });
      expect((await as(owner, http().get("/api/merchants/me"))).body.venues).toEqual([]);
      expect(
        (await as(newOwner, http().get("/api/merchants/me"))).body.venues.map(
          (v: { id: number }) => v.id,
        ),
      ).toEqual([venue.id]);
    });

    it("deleting a category strips it from venues", async () => {
      const [category] = await t.ds.query(
        `INSERT INTO categories (name, "order") VALUES ($1, 0) RETURNING id`,
        [DESCRIPTION],
      );

      await t.ds.query(`UPDATE venues SET categories = $1 WHERE id = $2`, [
        [category.id, 99],
        venue.id,
      ]);

      await as(admin, http().delete(`/api/admin/categories/${category.id}`)).expect(204);
      expect((await stored(venue.id)).categories).toEqual([99]);
    });

    it("403 for a merchant on /api/admin/*", async () => {
      await as(owner, http().get("/api/admin/merchants")).expect(403);
      await as(owner, http().get("/api/admin/venues")).expect(403);
    });
  });
});
