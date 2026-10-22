import request from "supertest";
import { decode } from "jpeg-js";
import jsQR from "jsqr";

import { createTestApp, type TestApp } from "../helpers/app";

describe("GET /api/qr/:code.jpg (integration)", () => {
  let t: TestApp;

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it("public, a JPEG with the code's QR, cached for a year", async () => {
    const res = await http().get("/api/qr/04718263.jpg").buffer(true).expect(200);

    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const image = decode(res.body as Buffer, { useTArray: true });

    expect(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data).toBe(
      "04718263",
    );
  });

  it.each([
    "0471826.jpg",
    "047182630.jpg",
    "0471 8263.jpg",
    "04718263.png",
    "04718263",
    "abcdefgh.jpg",
  ])("%p → 404", async (file) => {
    await http()
      .get(`/api/qr/${encodeURIComponent(file)}`)
      .expect(404);
  });
});
