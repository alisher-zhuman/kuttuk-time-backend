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
];

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

    it("creates prod's hand-made GIN index (kept out of TypeORM's sync)", async () => {
      const [index] = await ds.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'merchants_categories_idx'`,
      );

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
