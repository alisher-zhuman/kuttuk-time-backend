import request from "supertest";

import { createTestApp, type TestApp } from "../helpers/app";
import { createCategory, createMerchant, createVenue } from "../helpers/factories";

// The website's build reads the catalog without a token (SEO pages, sitemap.xml).
describe("GET /api/public/catalog (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("is public: visible venues in every language, nominals sorted, all categories", async () => {
    const category = await createCategory(t.ds);
    const venue = await createVenue(t.ds, {
      slug: "sierra",
      description: { ru: "Кофейня", kg: "Кофейня kg", en: "Coffee" },
      categories: [category.id],
      nominals: [2000, 500, 1000],
    });

    const res = await http().get("/api/public/catalog").expect(200);

    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body).toEqual({
      venues: [
        {
          id: venue.id,
          slug: "sierra",
          name: venue.name,
          description: { ru: "Кофейня", kg: "Кофейня kg", en: "Coffee" },
          logo: venue.logo,
          categories: [category.id],
          nominals: [500, 1000, 2000],
          validityMonths: 12,
          address: venue.address,
          mapUrl: venue.mapUrl,
          updatedAt: expect.any(String),
        },
      ],
      categories: [{ id: category.id, name: category.name, order: category.order }],
    });
  });

  it("hides an inactive venue and the venues of an inactive merchant; nothing internal leaks", async () => {
    const visible = await createVenue(t.ds);
    await createVenue(t.ds, { isActive: false });
    const off = await createMerchant(t.ds, { isActive: false });
    await createVenue(t.ds, { merchantId: off.id });

    const { body } = await http().get("/api/public/catalog").expect(200);

    expect(body.venues.map((v: { id: number }) => v.id)).toEqual([visible.id]);
    expect(body.venues[0]).not.toHaveProperty("merchantId");
    expect(body.venues[0]).not.toHaveProperty("isActive");
  });
});
