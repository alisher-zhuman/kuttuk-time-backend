import * as request from "supertest";

import { createTestApp, type TestApp } from "../helpers/app";
import { createVenue, createOrder, createUser } from "../helpers/factories";

// FINIK_REDIRECT_URL in globalSetup is https://t.me/kuttuk_time_bot/app.
const BASE = "https://t.me/kuttuk_time_bot/app";
const ID = "5e1c1f5b-0a3c-4c1b-9a59-2a1d7c8a3f10";

describe("GET /api/payments/return/:orderId (integration)", () => {
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

  it("UUID → 302 to the Mini App with startapp=order_<id>, no JWT needed", async () => {
    const res = await http().get(`/api/payments/return/${ID}`).expect(302);

    expect(res.headers.location).toBe(`${BASE}?startapp=order_${ID}`);
  });

  it("works for a real order the same as for any UUID (the order isn't looked up)", async () => {
    const user = await createUser(t.ds);
    const venue = await createVenue(t.ds);
    const order = await createOrder(t.ds, { userId: user.id, venueId: venue.id });

    const existing = await http().get(`/api/payments/return/${order.id}`).expect(302);
    const missing = await http().get(`/api/payments/return/${ID}`).expect(302);

    expect(existing.headers.location).toBe(`${BASE}?startapp=order_${order.id}`);
    expect(missing.headers.location).toBe(`${BASE}?startapp=order_${ID}`);
  });

  it.each(["not-a-uuid", "123", "order_5e1c1f5b", "%3Cscript%3E"])(
    "non-UUID %p → 302 to the bare Mini App, no startapp",
    async (orderId) => {
      const res = await http().get(`/api/payments/return/${orderId}`).expect(302);

      expect(res.headers.location).toBe(BASE);
    },
  );

  it("a query Finik appends (?paymentId=…&status=…) doesn't change the target", async () => {
    const res = await http()
      .get(`/api/payments/return/${ID}?paymentId=${ID}&status=succeeded&startapp=evil`)
      .expect(302);

    expect(res.headers.location).toBe(`${BASE}?startapp=order_${ID}`);
  });

  it("logs the full incoming URL, query included", async () => {
    const { Logger } = await import("@nestjs/common");
    const spy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    try {
      await http().get(`/api/payments/return/${ID}?paymentId=abc&status=succeeded`).expect(302);

      expect(spy).toHaveBeenCalledWith(
        `Payment return: /api/payments/return/${ID}?paymentId=abc&status=succeeded`,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
