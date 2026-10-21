import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/typeorm.options";
import { openTestDataSource } from "../helpers/db";

const MIGRATIONS = [
  "Baseline1760000000000",
  "AddOrdersAndCertificates1791786384962",
  "FinikWebhookAndNeedsReview1791798635519",
  "MerchantCategoryIntegrity1792043280467",
  "CertificateUsedAtInvariant1792053473835",
  "RefundedAndOrderResolutions1792486116886",
  "SplitMerchantsAndVenues1792500000000",
  "UserLanguage1792555538900",
  "Payouts1792570881461",
  "CertificateExpiryReminder1792574451008",
];

// Revert migrations from the newest down to (and including) `name`.
const undoDownTo = async (ds: DataSource, name: string) => {
  for (const later of MIGRATIONS.slice(MIGRATIONS.indexOf(name)).reverse()) {
    const [last] = await ds.query(`SELECT name FROM migrations ORDER BY id DESC LIMIT 1`);

    if (last.name !== later) {
      throw new Error(`expected ${later} to be the last applied migration, got ${last.name}`);
    }

    await ds.undoLastMigration();
  }
};

describe("Migrations (integration)", () => {
  describe("on an empty database", () => {
    const freshDb = `migrations_${randomBytes(4).toString("hex")}`;
    let admin: DataSource;
    let ds: DataSource;

    beforeAll(async () => {
      admin = await openTestDataSource();
      await admin.query(`CREATE DATABASE "${freshDb}"`);

      // migrationsRun off: this suite drives the migrations by hand.
      ds = new DataSource({
        ...buildTypeOrmOptions((key) => (key === "DATABASE_NAME" ? freshDb : process.env[key])),
        migrationsRun: false,
      });
      await ds.initialize();
    });

    afterAll(async () => {
      await ds?.destroy();
      await admin?.query(`DROP DATABASE IF EXISTS "${freshDb}"`);
      await admin?.destroy();
    });

    it("starts with pending migrations and none of our tables", async () => {
      await expect(ds.showMigrations()).resolves.toBe(true);
      await expect(
        ds.query(
          `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
        ),
      ).resolves.toEqual([{ n: 0 }]);
    });

    it("applies all migrations in order, starting with Baseline", async () => {
      const executed = await ds.runMigrations();

      expect(executed.map((m) => m.name)).toEqual(MIGRATIONS);
      await expect(ds.showMigrations()).resolves.toBe(false);
    });

    it("a second run is a no-op", async () => {
      await expect(ds.runMigrations()).resolves.toEqual([]);
    });

    it("leaves the schema exactly matching the entities (what migration:generate diffs)", async () => {
      const sql = await ds.driver.createSchemaBuilder().log();

      expect(sql.upQueries.map((q) => q.query)).toEqual([]);
    });

    // The split moves data, so check it on data: revert it, fill the old shape the way prod
    // had it, apply it again. Leaves the schema migrated and the tables empty.
    it("SplitMerchantsAndVenues: old merchants → merchant + venue with the same id, orders/certificates follow", async () => {
      await undoDownTo(ds, "SplitMerchantsAndVenues1792500000000");

      await ds.query(`INSERT INTO users (id, "telegramId", role) VALUES (1, 7000000001, 'user')`);
      await ds.query(`
        INSERT INTO merchants (id, name, description, categories, nominals, "validityMonths",
                               "merchantTelegramId", logo, slug, "isActive", "createdAt")
        VALUES (9, 'Sierra', '{"ru":"r","kg":"k","en":"e"}', '{1}', '{500}', 6, 8000000009,
                'https://x/a.webp', 'sierra', false, '2026-06-23 05:55:06'),
               (10, 'Coffeeroom', '{"ru":"r","kg":"k","en":"e"}', '{}', '{10,500}', 12, 8000000010,
                'https://x/b.webp', 'coffeeroom', true, '2026-07-01 00:00:00')`);
      await ds.query(`SELECT setval('merchants_id_seq', 10)`);
      await ds.query(`
        INSERT INTO orders (id, "userId", "merchantId", amount, status, "expiresAt", "paidAt")
        VALUES ('00000000-0000-4000-8000-000000000001', 1, 10, 500, 'paid', now(), now())`);
      await ds.query(`
        INSERT INTO certificates (id, code, "orderId", "merchantId", "ownerUserId", amount, "validUntil")
        VALUES ('00000000-0000-4000-8000-000000000002', 'KT-AAAA-BBBB',
                '00000000-0000-4000-8000-000000000001', 10, 1, 500, now() + interval '1 year')`);

      await ds.runMigrations();

      await expect(
        ds.query(
          `SELECT id, name, "telegramId"::int8::text AS tg, "isActive", "createdAt" FROM merchants ORDER BY id`,
        ),
      ).resolves.toEqual([
        // Deactivation moves to the merchant; old timestamps were UTC.
        {
          id: 9,
          name: "Sierra",
          tg: "8000000009",
          isActive: false,
          createdAt: new Date("2026-06-23T05:55:06Z"),
        },
        {
          id: 10,
          name: "Coffeeroom",
          tg: "8000000010",
          isActive: true,
          createdAt: new Date("2026-07-01T00:00:00Z"),
        },
      ]);
      await expect(
        ds.query(
          `SELECT id, "merchantId", name, slug, nominals, "validityMonths", "isActive" FROM venues ORDER BY id`,
        ),
      ).resolves.toEqual([
        {
          id: 9,
          merchantId: 9,
          name: "Sierra",
          slug: "sierra",
          nominals: [500],
          validityMonths: 6,
          isActive: true,
        },
        {
          id: 10,
          merchantId: 10,
          name: "Coffeeroom",
          slug: "coffeeroom",
          nominals: [10, 500],
          validityMonths: 12,
          isActive: true,
        },
      ]);
      await expect(ds.query(`SELECT "venueId", "merchantId" FROM orders`)).resolves.toEqual([
        { venueId: 10, merchantId: 10 },
      ]);
      await expect(ds.query(`SELECT "venueId" FROM certificates`)).resolves.toEqual([
        { venueId: 10 },
      ]);

      // Both sequences continue after the moved ids.
      const [{ m, v }] = await ds.query(
        `SELECT nextval('merchants_id_seq')::int AS m, nextval('venues_id_seq')::int AS v`,
      );

      expect([m, v]).toEqual([11, 11]);

      await ds.query(`TRUNCATE certificates, orders, venues, merchants, users CASCADE`);
    });

    it("SplitMerchantsAndVenues can't be reverted once a merchant owns several venues", async () => {
      await ds.query(`INSERT INTO merchants (id, name, "telegramId") VALUES (1, 'Chain', 1)`);
      await ds.query(`
        INSERT INTO venues ("merchantId", name, description, categories, nominals, logo, slug)
        VALUES (1, 'A', '{"ru":"r","kg":"k","en":"e"}', '{}', '{500}', 'x', 'a'),
               (1, 'B', '{"ru":"r","kg":"k","en":"e"}', '{}', '{500}', 'x', 'b')`);

      await expect(undoDownTo(ds, "SplitMerchantsAndVenues1792500000000")).rejects.toThrow(
        /owns several venues/,
      );
      // The split itself stayed; only the later migrations were reverted — re-apply them.
      await ds.runMigrations();
      await expect(ds.showMigrations()).resolves.toBe(false);

      await ds.query(`TRUNCATE venues, merchants CASCADE`);
    });

    it("creates prod's hand-made GIN index (kept out of TypeORM's sync)", async () => {
      const [index] = await ds.query(
        `SELECT tablename, indexdef FROM pg_indexes WHERE indexname = 'venues_categories_idx'`,
      );

      expect(index.tablename).toBe("venues");
      expect(index.indexdef).toContain("USING gin (categories)");
    });
  });

  it("the app's own options (DB_SYNC=false) ran the migrations on the shared test DB", async () => {
    const ds = await openTestDataSource();

    try {
      const rows: Array<{ name: string }> = await ds.query(
        `SELECT name FROM migrations ORDER BY id`,
      );

      expect(rows.map((r) => r.name)).toEqual(MIGRATIONS);
      await expect(ds.showMigrations()).resolves.toBe(false);
    } finally {
      await ds.destroy();
    }
  });
});
