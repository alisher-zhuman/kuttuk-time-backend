import request from "supertest";

import { VALID_NOMINALS, VALID_VALIDITY_MONTHS } from "../../src/venues/venue.constants";
import { createTestApp, type TestApp } from "../helpers/app";
import { createVenue, createUser } from "../helpers/factories";

const ascending = (values: number[]) => [...values].sort((a, b) => a - b);

describe("GET /api/venues/options (integration)", () => {
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

  it("is public and returns exactly the backend constants, sorted ascending", async () => {
    const res = await http().get("/api/venues/options").expect(200);

    expect(res.body).toEqual({
      nominals: ascending(VALID_NOMINALS),
      validityMonths: ascending(VALID_VALIDITY_MONTHS),
    });
    expect(res.body.nominals).toEqual(ascending(res.body.nominals));
  });

  it("works with a JWT too", async () => {
    const user = await createUser(t.ds);

    await http().get("/api/venues/options").auth(t.tokenFor(user), { type: "bearer" }).expect(200);
  });

  it("does not shadow GET /api/venues/:idOrSlug", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds);
    const get = (path: string) =>
      http().get(path).auth(t.tokenFor(user), { type: "bearer" }).expect(200);

    expect((await get(`/api/venues/${venue.id}`)).body.id).toBe(venue.id);
    expect((await get(`/api/venues/${venue.slug}`)).body.id).toBe(venue.id);
  });

  it.each(["options", "me"])(
    "reserves the slug %p (it would be shadowed by the route)",
    async (slug) => {
      const admin = await createUser(t.ds, { role: "admin" });
      const venue = await createVenue(t.ds);

      const res = await http()
        .patch(`/api/admin/venues/${venue.id}`)
        .auth(t.tokenFor(admin), { type: "bearer" })
        .send({ slug })
        .expect(400);

      expect(res.body.message).toContain("slug must not be one of: me, options");
    },
  );
});
