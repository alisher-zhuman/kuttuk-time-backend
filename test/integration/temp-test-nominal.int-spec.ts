// TEMP: covers the temporary 10 KGS nominal (VALID_NOMINALS) used to test payments on prod.
// Delete this file together with that nominal before launch (see CLAUDE.md TODOs).
import * as request from "supertest";

import { Merchant } from "../../src/merchants/entities/merchant.entity";
import { Order } from "../../src/orders/entities/order.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createMerchant, createUser } from "../helpers/factories";

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

  it("POST /api/admin/merchants accepts nominals with 10", async () => {
    const admin = await createUser(t.ds, { role: "admin" });

    const res = await http()
      .post("/api/admin/merchants")
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({
        name: "Test Coffee",
        description: { ru: "Тест", kg: "Тест", en: "Test" },
        categories: [1],
        nominals: [10, 500],
        validityMonths: 12,
        logo: "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/x.webp",
        merchantTelegramId: 8_200_000_001,
        slug: "test-coffee",
      })
      .expect(201);

    expect(res.body.nominals).toEqual([10, 500]);
  });

  it("PATCH /api/admin/merchants/:id accepts nominals [10]", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const merchant = await createMerchant(t.ds);

    await http()
      .patch(`/api/admin/merchants/${merchant.id}`)
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({ nominals: [10] })
      .expect(200);

    expect(
      (await t.ds.getRepository(Merchant).findOneByOrFail({ id: merchant.id })).nominals,
    ).toEqual([10]);
  });

  it("PATCH /api/merchants/me (the merchant's own form) accepts 10", async () => {
    const owner = await createUser(t.ds, { role: "merchant" });
    const merchant = await createMerchant(t.ds, { merchantTelegramId: owner.telegramId });

    await http()
      .patch("/api/merchants/me")
      .auth(t.tokenFor(owner), { type: "bearer" })
      .send({ nominals: [10, 1000] })
      .expect(200);

    expect(
      (await t.ds.getRepository(Merchant).findOneByOrFail({ id: merchant.id })).nominals,
    ).toEqual([10, 1000]);
  });

  it("POST /api/orders with nominal 10 → order of 10 KGS, Finik asked for 10", async () => {
    const buyer = await createUser(t.ds);
    const merchant = await createMerchant(t.ds, { nominals: [10, 500] });

    const res = await http()
      .post("/api/orders")
      .auth(t.tokenFor(buyer), { type: "bearer" })
      .send({ merchantId: merchant.id, nominal: 10 })
      .expect(201);

    expect((await t.ds.getRepository(Order).findOneByOrFail({ id: res.body.orderId })).amount).toBe(
      10,
    );
    expect(t.finik.calls[0].amount).toBe(10);
  });

  it("GET /api/merchants/options lists 10 first", async () => {
    const res = await http().get("/api/merchants/options").expect(200);

    expect(res.body.nominals[0]).toBe(10);
  });

  it("still rejects a nominal that isn't in the list (e.g. 11)", async () => {
    const admin = await createUser(t.ds, { role: "admin" });
    const merchant = await createMerchant(t.ds);

    await http()
      .patch(`/api/admin/merchants/${merchant.id}`)
      .auth(t.tokenFor(admin), { type: "bearer" })
      .send({ nominals: [11] })
      .expect(400);
  });
});
