import * as request from "supertest";
import { QueryFailedError, type DataSource } from "typeorm";

import { Category } from "../../src/categories/entities/category.entity";
import { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { openTestDataSource, truncateAll } from "../helpers/db";
import { createMerchant, createUser, createVenue } from "../helpers/factories";

const FULL = { ru: "Кофе", kg: "Кофе", en: "Coffee" };

// Postgres error codes: 23502 not_null_violation, 23514 check_violation.
const violation = (code: "23502" | "23514", extra: Record<string, unknown> = {}) =>
  expect.objectContaining({ driverError: expect.objectContaining({ code, ...extra }) });

describe("venues/categories integrity — DB constraints (integration)", () => {
  let ds: DataSource;
  let merchantId: number;

  // Raw SQL, so nothing in the app layer can mask what the database itself enforces.
  const insertVenue = (overrides: Record<string, string> = {}) => {
    const values = {
      name: "'Raw'",
      description: `'${JSON.stringify(FULL)}'`,
      categories: "'{}'",
      nominals: "'{500}'",
      merchantId: String(merchantId),
      logo: "'x'",
      slug: `'raw-${Math.random().toString(36).slice(2)}'`,
      ...overrides,
    };
    const columns = Object.keys(values).map((c) => `"${c}"`);

    return ds.query(
      `INSERT INTO venues (${columns.join(", ")}) VALUES (${Object.values(values).join(", ")})`,
    );
  };

  const insertCategory = (name: string) =>
    ds.query(`INSERT INTO categories (name) VALUES ($1::jsonb)`, [name]);

  const fail = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

  beforeAll(async () => {
    ds = await openTestDataSource();
  });

  beforeEach(async () => {
    await truncateAll(ds);
    [{ id: merchantId }] = await ds.query(
      `INSERT INTO merchants (name, "telegramId") VALUES ('Raw', 9000000001) RETURNING id`,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it("accepts a complete venue and category", async () => {
    await expect(insertVenue()).resolves.toBeDefined();
    await expect(insertCategory(JSON.stringify(FULL))).resolves.toBeDefined();
  });

  it("rejects slug NULL", async () => {
    const error = await fail(insertVenue({ slug: "NULL" }));

    expect(error).toBeInstanceOf(QueryFailedError);
    expect(error).toEqual(violation("23502", { column: "slug" }));
  });

  it("rejects description NULL", async () => {
    expect(await fail(insertVenue({ description: "NULL" }))).toEqual(
      violation("23502", { column: "description" }),
    );
  });

  it.each([
    ["without en", { ru: "a", kg: "b" }],
    ["without ru", { kg: "b", en: "c" }],
    ["empty object", {}],
  ])("rejects a description %s", async (_name, description) => {
    expect(await fail(insertVenue({ description: `'${JSON.stringify(description)}'` }))).toEqual(
      violation("23514", { constraint: "venues_description_langs" }),
    );
  });

  it("rejects empty nominals", async () => {
    expect(await fail(insertVenue({ nominals: "'{}'" }))).toEqual(
      violation("23514", { constraint: "venues_nominals_not_empty" }),
    );
  });

  it("rejects an UPDATE that drops a language too, not only INSERT", async () => {
    const venue = await createVenue(ds);

    expect(
      await fail(
        ds.query(`UPDATE venues SET description = description - 'kg' WHERE id = $1`, [venue.id]),
      ),
    ).toEqual(violation("23514", { constraint: "venues_description_langs" }));
  });

  it.each([
    ["without kg", { ru: "a", en: "c" }],
    ["empty object", {}],
  ])("rejects a category name %s", async (_name, name) => {
    expect(await fail(insertCategory(JSON.stringify(name)))).toEqual(
      violation("23514", { constraint: "categories_name_langs" }),
    );
  });
});

describe("venues/categories integrity — DTO validation (integration)", () => {
  let t: TestApp;
  let adminToken: string;

  const http = () => request(t.app.getHttpServer());
  const admin = (req: request.Test) => req.auth(adminToken, { type: "bearer" });

  const validVenue = async (overrides: Record<string, unknown> = {}) => ({
    name: "Sierra Coffee",
    description: FULL,
    categories: [1],
    nominals: [500, 1000],
    validityMonths: 12,
    logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/x.webp",
    merchantId: (await createMerchant(t.ds)).id,
    slug: `sierra-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  });

  const badTranslations: Array<[string, unknown]> = [
    ["a missing language", { ru: "Кофе", kg: "Кофе" }],
    ["an extra key", { ...FULL, de: "Kaffee" }],
    ["an empty string", { ...FULL, en: "" }],
    ["a blank string", { ...FULL, kg: "   " }],
    ["a non-string value", { ...FULL, ru: 1 }],
    ["null", null],
    ["a plain string", "Coffee"],
  ];

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    adminToken = t.tokenFor(await createUser(t.ds, { role: "admin" }));
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("POST /api/admin/venues", () => {
    it("201 with all three languages", async () => {
      await admin(http().post("/api/admin/venues"))
        .send(await validVenue())
        .expect(201);
    });

    it.each(badTranslations)("400 on description with %s", async (_name, description) => {
      const res = await admin(http().post("/api/admin/venues"))
        .send(await validVenue({ description }))
        .expect(400);

      expect(res.body.message).toContain("description must have exactly the keys ru, kg, en");
      expect(await t.ds.getRepository(Venue).count()).toBe(0);
    });

    it("400 on empty nominals (already enforced by the DTO)", async () => {
      await admin(http().post("/api/admin/venues"))
        .send(await validVenue({ nominals: [] }))
        .expect(400);
    });
  });

  describe("PATCH /api/admin/venues/:id", () => {
    it.each(badTranslations)("400 on description with %s", async (_name, description) => {
      const venue = await createVenue(t.ds);

      await admin(http().patch(`/api/admin/venues/${venue.id}`))
        .send({ description })
        .expect(400);

      expect(
        (await t.ds.getRepository(Venue).findOneByOrFail({ id: venue.id })).description,
      ).toEqual(venue.description);
    });

    it.each([
      ["slug", null],
      ["name", null],
      ["name", ""],
      ["nominals", null],
      ["nominals", []],
    ])("400 (not 500) on %s = %p", async (field, value) => {
      const venue = await createVenue(t.ds);

      await admin(http().patch(`/api/admin/venues/${venue.id}`))
        .send({ [field]: value })
        .expect(400);
    });

    it("200 with a full description; omitted fields stay as they were", async () => {
      const venue = await createVenue(t.ds);
      const description = { ru: "Новое", kg: "Жаңы", en: "New" };

      await admin(http().patch(`/api/admin/venues/${venue.id}`))
        .send({ description })
        .expect(200);

      const saved = await t.ds.getRepository(Venue).findOneByOrFail({ id: venue.id });

      expect(saved.description).toEqual(description);
      expect(saved.slug).toBe(venue.slug);
    });
  });

  describe("PATCH /api/merchants/me/venues/:id", () => {
    it.each(badTranslations)("400 on description with %s", async (_name, description) => {
      const owner = await createUser(t.ds, { role: "merchant" });
      const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
      const venue = await createVenue(t.ds, { merchantId: merchant.id });

      await http()
        .patch(`/api/merchants/me/venues/${venue.id}`)
        .auth(t.tokenFor(owner), { type: "bearer" })
        .send({ description })
        .expect(400);
    });
  });

  describe("categories", () => {
    it("POST 201 with all three languages", async () => {
      await admin(http().post("/api/admin/categories")).send({ name: FULL }).expect(201);
    });

    it.each(badTranslations)("POST 400 on name with %s", async (_name, name) => {
      await admin(http().post("/api/admin/categories")).send({ name }).expect(400);
      expect(await t.ds.getRepository(Category).count()).toBe(0);
    });

    it.each(badTranslations)("PATCH 400 on name with %s", async (_name, name) => {
      const category = await t.ds.getRepository(Category).save({ name: FULL, order: 0 });

      await admin(http().patch(`/api/admin/categories/${category.id}`))
        .send({ name })
        .expect(400);
    });
  });

  describe("public responses", () => {
    it("description and category name are always a string in the requested language", async () => {
      const user = await createUser(t.ds);
      const venue = await createVenue(t.ds, {
        description: { ru: "Русский", kg: "Кыргызча", en: "English" },
      });

      await t.ds.getRepository(Category).save({ name: { ru: "Кофе", kg: "Кофе", en: "Coffee" } });

      const token = t.tokenFor(user);
      const get = (path: string, lang: string) =>
        http().get(path).auth(token, { type: "bearer" }).set("Accept-Language", lang).expect(200);

      expect((await get(`/api/venues/${venue.id}`, "en")).body.description).toBe("English");
      expect((await get(`/api/venues/${venue.id}`, "de")).body.description).toBe("Кыргызча");
      expect((await get("/api/venues", "ru")).body[0].description).toBe("Русский");
      expect((await get("/api/categories", "en")).body[0].name).toBe("Coffee");
    });
  });
});
