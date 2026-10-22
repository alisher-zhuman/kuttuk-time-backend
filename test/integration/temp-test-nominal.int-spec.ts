// TEMP: covers the temporary 10 KGS nominal (VALID_NOMINALS) used to test payments on prod.
// Delete this file together with that nominal before launch (see CLAUDE.md TODOs).
import request from "supertest";

import { Venue } from "../../src/venues/entities/venue.entity";
import { Order } from "../../src/orders/entities/order.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createUser, createVenue, createCategory } from "../helpers/factories";

describe("TEMP 10 KGS test nominal (integration)", () => {
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

  it("POST /api/admin/venues accepts nominals with 10", async () => {
    const admin = await createUser(t.ds, { role: "admin" });

    const res = await http()
      .post("/api/admin/venues")
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({
        name: "Test Coffee",
        description: { ru: "Тест", kg: "Тест", en: "Test" },
        categories: [(await createCategory(t.ds)).id],
        nominals: [10, 500],
        validityMonths: 12,
        logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/x.webp",
        merchantId: (await createMerchant(t.ds)).id,
        slug: "test-coffee",
      })
      .expect(201);

    expect(res.body.nominals).toEqual([10, 500]);
  });

  it("PATCH /api/admin/venues/:id accepts nominals [10]", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const venue = await createVenue(t.ds);

    await http()
      .patch(`/api/admin/venues/${venue.id}`)
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({ nominals: [10] })
      .expect(200);

    expect((await t.ds.getRepository(Venue).findOneByOrFail({ id: venue.id })).nominals).toEqual([
      10,
    ]);
  });

  it("PATCH /api/merchants/me/venues/:id (the owner's own form) accepts 10", async () => {
    const owner = await createUser(t.ds, { role: "merchant" });
    const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });
    const venue = await createVenue(t.ds, { merchantId: merchant.id });

    await http()
      .patch(`/api/merchants/me/venues/${venue.id}`)
      .auth(t.tokenFor(owner), { type: "bearer" })
      .send({ nominals: [10, 1000] })
      .expect(200);

    expect((await t.ds.getRepository(Venue).findOneByOrFail({ id: venue.id })).nominals).toEqual([
      10, 1000,
    ]);
  });

  it("POST /api/orders with nominal 10 → order of 10 KGS, Finik asked for 10", async () => {
    const buyer = await createUser(t.ds);
    const venue = await createVenue(t.ds, { nominals: [10, 500] });

    const res = await http()
      .post("/api/orders")
      .auth(t.tokenFor(buyer), { type: "bearer" })
      .send({ venueId: venue.id, nominal: 10 })
      .expect(201);

    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: res.body.orderId })).amount).toBe(
      10,
    );
    expect(t.finik.calls[0].amount).toBe(10);
  });

  it("GET /api/venues/options lists 10 first", async () => {
    const res = await http().get("/api/venues/options").expect(200);

    expect(res.body.nominals[0]).toBe(10);
  });

  it("still rejects a nominal that isn't in the list (e.g. 11)", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const venue = await createVenue(t.ds);

    await http()
      .patch(`/api/admin/venues/${venue.id}`)
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({ nominals: [11] })
      .expect(400);
  });
});
