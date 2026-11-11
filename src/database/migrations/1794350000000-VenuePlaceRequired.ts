import { MigrationInterface, QueryRunner } from "typeorm";

export class VenuePlaceRequired1794350000000 implements MigrationInterface {
  name = "VenuePlaceRequired1794350000000";

  // A venue's address and map link are required since 2026-11-11. On prod all 8 venues were
  // filled before this deploy (test values: "г. Бишкек (тестовый адрес)" + a 2GIS search
  // link); anything left blank meanwhile gets the same placeholder, so the app still boots.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "venues" SET "address" = 'г. Бишкек (тестовый адрес)'
             WHERE "address" IS NULL OR btrim("address") = ''
        `);
    await queryRunner.query(`
            UPDATE "venues"
               SET "mapUrl" = 'https://2gis.kg/bishkek/search/' || replace("name", ' ', '%20')
             WHERE "mapUrl" IS NULL OR btrim("mapUrl") = ''
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ALTER COLUMN "address"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ALTER COLUMN "mapUrl"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ADD CONSTRAINT "venues_map_url_not_blank" CHECK (btrim("mapUrl") <> '')
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ADD CONSTRAINT "venues_address_not_blank" CHECK (btrim("address") <> '')
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "venues" DROP CONSTRAINT "venues_address_not_blank"
        `);
    await queryRunner.query(`
            ALTER TABLE "venues" DROP CONSTRAINT "venues_map_url_not_blank"
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ALTER COLUMN "mapUrl" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ALTER COLUMN "address" DROP NOT NULL
        `);
  }
}
