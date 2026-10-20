import { MigrationInterface, QueryRunner } from "typeorm";

// Splits the old "merchants" table into:
//   venues    — the storefront (everything the old table had except the owner), same ids;
//   merchants — the owner's business account (name, telegramId, isActive), one per old row,
//               with id = the venue's id, so every existing reference keeps pointing at the
//               right row and old /:slug links keep working.
// Done by renaming, not drop + create: no data is copied out of the storefront rows.
// Constraint names are the ones TypeORM derives for the new entities, so schema diffs stay clean.
export class SplitMerchantsAndVenues1792500000000 implements MigrationInterface {
  name = "SplitMerchantsAndVenues1792500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The old table becomes "venues", with everything on it renamed to the venues names.
    await queryRunner.query(`ALTER TABLE "merchants" RENAME TO "venues"`);
    await queryRunner.query(`ALTER SEQUENCE "merchants_id_seq" RENAME TO "venues_id_seq"`);
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" TO "PK_cb0f885278d12384eb7a81818be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "merchants_slug_key" TO "UQ_9fd71efb7abb246a69847399d14"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "merchants_description_langs" TO "venues_description_langs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "merchants_nominals_not_empty" TO "venues_nominals_not_empty"`,
    );
    await queryRunner.query(
      `ALTER INDEX "merchants_categories_idx" RENAME TO "venues_categories_idx"`,
    );

    // 2. The new "merchants": one business account per venue, same id. The old createdAt /
    //    updatedAt are timestamp without time zone holding UTC (the prod session zone is GMT).
    await queryRunner.query(`
      CREATE TABLE "merchants" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "telegramId" bigint NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_2d9e468944066ad039a5caae2fc" UNIQUE ("telegramId"),
        CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "merchants" ("id", "name", "telegramId", "isActive", "createdAt", "updatedAt")
      SELECT "id", "name", "merchantTelegramId", "isActive",
             "createdAt" AT TIME ZONE 'UTC', "updatedAt" AT TIME ZONE 'UTC'
        FROM "venues"
    `);
    await queryRunner.query(`
      SELECT setval(pg_get_serial_sequence('merchants', 'id'),
                    coalesce(max("id"), 1), max("id") IS NOT NULL)
        FROM "merchants"
    `);

    // 3. venues → their merchant. Deactivation moves to the merchant (it also drives the login
    //    role and the edit ban), so every venue starts active: visibility stays exactly the same.
    await queryRunner.query(`ALTER TABLE "venues" ADD "merchantId" integer`);
    await queryRunner.query(`UPDATE "venues" SET "merchantId" = "id", "isActive" = true`);
    await queryRunner.query(`ALTER TABLE "venues" ALTER COLUMN "merchantId" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "venues" ADD CONSTRAINT "FK_b1d5c82df91a11f84d70c79a8c0"
        FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "merchantTelegramId"`);

    // 4. orders: the old merchantId already pointed at the (renamed) venues row → venueId.
    //    A new merchantId is the owner snapshot at the moment of the sale (payouts).
    await queryRunner.query(`ALTER TABLE "orders" RENAME COLUMN "merchantId" TO "venueId"`);
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME CONSTRAINT "FK_c9e4efcabb250e585daa4c19624" TO "FK_eadde698668d69b9a4123583e4f"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "merchantId" integer`);
    await queryRunner.query(`
      UPDATE "orders" o SET "merchantId" = v."merchantId" FROM "venues" v WHERE v."id" = o."venueId"
    `);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "merchantId" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "FK_c9e4efcabb250e585daa4c19624"
        FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    // 5. certificates: merchantId → venueId (redeemed by whoever owns the venue now).
    await queryRunner.query(`ALTER TABLE "certificates" RENAME COLUMN "merchantId" TO "venueId"`);
    await queryRunner.query(
      `ALTER TABLE "certificates" RENAME CONSTRAINT "FK_8080d50576090a9937b93d5eb93" TO "FK_6b4e3cc9afbbd728d1c2f3d8810"`,
    );
  }

  // Only possible while every merchant still owns at most one venue (the old table had one
  // owner per row, unique). Venues moved between merchants lose that history.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [chain]: Array<{ id: number }> = await queryRunner.query(
      `SELECT "merchantId" AS "id" FROM "venues" GROUP BY "merchantId" HAVING count(*) > 1 LIMIT 1`,
    );

    if (chain) {
      throw new Error(`Can't revert: merchant ${chain.id} owns several venues`);
    }

    await queryRunner.query(
      `ALTER TABLE "certificates" RENAME CONSTRAINT "FK_6b4e3cc9afbbd728d1c2f3d8810" TO "FK_8080d50576090a9937b93d5eb93"`,
    );
    await queryRunner.query(`ALTER TABLE "certificates" RENAME COLUMN "venueId" TO "merchantId"`);

    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_c9e4efcabb250e585daa4c19624"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "merchantId"`);
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME CONSTRAINT "FK_eadde698668d69b9a4123583e4f" TO "FK_c9e4efcabb250e585daa4c19624"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" RENAME COLUMN "venueId" TO "merchantId"`);

    await queryRunner.query(`ALTER TABLE "venues" ADD "merchantTelegramId" bigint`);
    await queryRunner.query(`
      UPDATE "venues" v SET "merchantTelegramId" = m."telegramId", "isActive" = v."isActive" AND m."isActive"
        FROM "merchants" m WHERE m."id" = v."merchantId"
    `);
    await queryRunner.query(`ALTER TABLE "venues" ALTER COLUMN "merchantTelegramId" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "venues" ADD CONSTRAINT "UQ_dbc92b7610efaa5d63a5d4bc604" UNIQUE ("merchantTelegramId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" DROP CONSTRAINT "FK_b1d5c82df91a11f84d70c79a8c0"`,
    );
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "merchantId"`);
    await queryRunner.query(`DROP TABLE "merchants"`);

    await queryRunner.query(
      `ALTER INDEX "venues_categories_idx" RENAME TO "merchants_categories_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "venues_nominals_not_empty" TO "merchants_nominals_not_empty"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "venues_description_langs" TO "merchants_description_langs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "UQ_9fd71efb7abb246a69847399d14" TO "merchants_slug_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" RENAME CONSTRAINT "PK_cb0f885278d12384eb7a81818be" TO "PK_4fd312ef25f8e05ad47bfe7ed25"`,
    );
    await queryRunner.query(`ALTER SEQUENCE "venues_id_seq" RENAME TO "merchants_id_seq"`);
    await queryRunner.query(`ALTER TABLE "venues" RENAME TO "merchants"`);
  }
}
