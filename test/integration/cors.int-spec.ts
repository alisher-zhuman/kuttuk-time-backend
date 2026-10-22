import request from "supertest";

import { createTestApp, type TestApp } from "../helpers/app";

// ALLOWED_ORIGINS is unset in the test env (NODE_ENV=test) → only the local dev server.
describe("CORS (integration)", () => {
  let t: TestApp;

  const preflight = (origin: string) =>
    request(t.app.getHttpServer())
      .options("/api/orders")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("an allowed origin gets the CORS headers (no credentials — auth is a bearer token)", async () => {
    const res = await preflight("http://localhost:5173");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();

    const get = await request(t.app.getHttpServer())
      .get("/api/venues/options")
      .set("Origin", "http://localhost:5173")
      .expect(200);

    expect(get.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("any other origin gets none", async () => {
    for (const origin of ["https://evil.example", "https://kuttuk-time-git-x.vercel.app"]) {
      expect((await preflight(origin)).headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
});
