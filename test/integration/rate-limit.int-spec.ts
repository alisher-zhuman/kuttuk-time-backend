import request from "supertest";

import type { Venue } from "../../src/venues/entities/venue.entity";
import type { User } from "../../src/users/entities/user.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createVenue, createOrder, createUser } from "../helpers/factories";

// In tests every request comes from 127.0.0.1 — exactly the "everyone behind one proxy IP"
// situation on Koyeb. Per-user limits must hold anyway.
describe("rate limits per user (integration)", () => {
  let t: TestApp;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());

  const postOrder = (user: User) =>
    http()
      .post("/api/orders")
      .auth(t.tokenFor(user), { type: "bearer" })
      .send({ venueId: venue.id, nominal: 1000 });

  const statuses = async (requests: Array<() => request.Test>) => {
    const result: number[] = [];

    for (const send of requests) {
      result.push((await send()).status);
    }

    return result;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    venue = await createVenue(t.ds);
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("POST /api/orders — 10/min per user", () => {
    it("two users, 10 orders each from the same IP: no 429 (a shared IP counter would block at 11)", async () => {
      const [alice, bob] = [await createUser(t.ds), await createUser(t.ds)];

      const result = await statuses(
        Array.from({ length: 10 }, () => [() => postOrder(alice), () => postOrder(bob)]).flat(),
      );

      expect(result).toEqual(Array(20).fill(201));
    });

    it("the 11th order of one user → 429; another user is unaffected", async () => {
      const [alice, bob] = [await createUser(t.ds), await createUser(t.ds)];

      const result = await statuses(Array.from({ length: 11 }, () => () => postOrder(alice)));

      expect(result).toEqual([...Array(10).fill(201), 429]);
      await postOrder(bob).expect(201);
    });

    it("counts per user even when the requests fail validation (the limit is checked first)", async () => {
      const alice = await createUser(t.ds);
      const bad = () =>
        http()
          .post("/api/orders")
          .auth(t.tokenFor(alice), { type: "bearer" })
          .send({ venueId: venue.id, nominal: 1 });

      const result = await statuses(Array.from({ length: 11 }, () => bad));

      expect(result).toEqual([...Array(10).fill(400), 429]);
    });

    it("exposes the per-user counter in X-RateLimit-* headers", async () => {
      const [alice, bob] = [await createUser(t.ds), await createUser(t.ds)];

      await postOrder(alice);
      await postOrder(alice);
      const res = await postOrder(bob);

      expect(res.headers["x-ratelimit-limit"]).toBe("10");
      expect(res.headers["x-ratelimit-remaining"]).toBe("9");
    });
  });

  describe("GET /api/orders/:id — 60/min per user", () => {
    it("polling 20 times in a row (every 3 s for a minute) is fine", async () => {
      const user = await createUser(t.ds);
      const order = await createOrder(t.ds, { userId: user.id, venueId: venue.id });
      const poll = () =>
        http().get(`/api/orders/${order.id}`).auth(t.tokenFor(user), { type: "bearer" });

      expect(await statuses(Array.from({ length: 20 }, () => poll))).toEqual(Array(20).fill(200));
    });

    it("four buyers polling at once (80 requests from one IP, over the old shared 60) don't block each other", async () => {
      const users = await Promise.all(Array.from({ length: 4 }, () => createUser(t.ds)));
      const orders = await Promise.all(
        users.map((user) => createOrder(t.ds, { userId: user.id, venueId: venue.id })),
      );

      const polls = Array.from({ length: 20 }, () =>
        users.map(
          (user, i) => () =>
            http().get(`/api/orders/${orders[i].id}`).auth(t.tokenFor(user), { type: "bearer" }),
        ),
      ).flat();

      expect(new Set(await statuses(polls))).toEqual(new Set([200]));
    });

    it("the 61st poll of one user → 429", async () => {
      const user = await createUser(t.ds);
      const order = await createOrder(t.ds, { userId: user.id, venueId: venue.id });
      const poll = () =>
        http().get(`/api/orders/${order.id}`).auth(t.tokenFor(user), { type: "bearer" });

      const result = await statuses(Array.from({ length: 61 }, () => poll));

      expect(result.slice(0, 60)).toEqual(Array(60).fill(200));
      expect(result[60]).toBe(429);
    });
  });

  describe("guard order", () => {
    it("JwtGuard runs first: requests without a valid token get 401, never 429", async () => {
      const result = await statuses(
        Array.from(
          { length: 12 },
          () => () => http().post("/api/orders").send({ venueId: venue.id, nominal: 1000 }),
        ),
      );

      expect(new Set(result)).toEqual(new Set([401]));
    });
  });
});
