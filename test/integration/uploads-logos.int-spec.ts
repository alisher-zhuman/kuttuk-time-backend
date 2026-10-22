import request from "supertest";

import type { User } from "../../src/users/entities/user.entity";
import type { Venue } from "../../src/venues/entities/venue.entity";
import { createTestApp, type TestApp } from "../helpers/app";
import { createCategory, createMerchant, createUser, createVenue } from "../helpers/factories";

const OWN = (id: string) =>
  `https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/${id}.webp`;
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

describe("uploads and venue logos (integration)", () => {
  let t: TestApp;
  let owner: User;
  let venue: Venue;

  const http = () => request(t.app.getHttpServer());
  const as = (user: User, req: request.Test) => req.auth(t.tokenFor(user), { type: "bearer" });
  const patchOwn = (body: Record<string, unknown>) =>
    as(owner, http().patch(`/api/merchants/me/venues/${venue.id}`)).send(body);

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    owner = await createUser(t.ds, { role: "merchant" });

    const merchant = await createMerchant(t.ds, { telegramId: owner.telegramId });

    venue = await createVenue(t.ds, { merchantId: merchant.id, logo: OWN("old") });
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("POST /api/upload", () => {
    it("an image → 201 with our Cloudinary URL", async () => {
      const res = await as(owner, http().post("/api/upload"))
        .attach("file", PNG, { filename: "logo.png", contentType: "image/png" })
        .expect(201);

      expect(res.body).toEqual({ url: OWN("fake1") });
      expect(t.cloudinary.uploads).toEqual(["logo.png"]);
    });

    it("over 5 MB → 413; no file → 400; not an image → 400; a buyer → 403", async () => {
      await as(owner, http().post("/api/upload"))
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "big.png",
          contentType: "image/png",
        })
        .expect(413);
      await as(owner, http().post("/api/upload")).expect(400);
      await as(owner, http().post("/api/upload"))
        .attach("file", Buffer.from("hi"), { filename: "a.txt", contentType: "text/plain" })
        .expect(400);
      await as(await createUser(t.ds), http().post("/api/upload"))
        .attach("file", PNG, { filename: "logo.png", contentType: "image/png" })
        .expect(403);
      expect(t.cloudinary.uploads).toEqual([]);
    });
  });

  describe("venue logo", () => {
    it.each([
      [
        "another Cloudinary account",
        "https://res.cloudinary.com/evil/image/upload/v1/kuttuk-time/x.webp",
      ],
      ["another folder of ours", "https://res.cloudinary.com/test/image/upload/v1/other/x.webp"],
      ["a path trick", "https://res.cloudinary.com/test/image/upload/v1/kuttuk-time/../x.webp"],
    ])("a logo from %s → 400, nothing deleted", async (_label, logo) => {
      await patchOwn({ logo }).expect(400);
      expect(t.cloudinary.deleted).toEqual([]);
    });

    it("a new own logo → saved; the old file is deleted", async () => {
      await patchOwn({ logo: OWN("new") }).expect(200);
      expect(t.cloudinary.deleted).toEqual(["kuttuk-time/old"]);
    });

    it("the old file is kept while another venue still shows it", async () => {
      await createVenue(t.ds, { logo: OWN("old") });

      await patchOwn({ logo: OWN("new") }).expect(200);
      expect(t.cloudinary.deleted).toEqual([]);
    });

    it("re-sending an unchanged legacy logo (outside the folder) is fine and deletes nothing", async () => {
      const legacy = "https://res.cloudinary.com/test/image/upload/v1/master_bank_logo.png";

      await t.ds.query(`UPDATE venues SET logo = $1 WHERE id = $2`, [legacy, venue.id]);
      await patchOwn({ logo: legacy, name: "Renamed" }).expect(200);
      await patchOwn({ logo: OWN("new") }).expect(200);
      // Not ours to delete (not in kuttuk-time/).
      expect(t.cloudinary.deleted).toEqual([]);
    });
  });

  describe("venue categories", () => {
    it("an unknown category id → 400; existing ones → 200", async () => {
      const category = await createCategory(t.ds);

      await patchOwn({ categories: [category.id, 999_999] }).expect(400);
      await patchOwn({ categories: [category.id] }).expect(200);
    });
  });
});
