import { MigrationInterface, QueryRunner } from "typeorm";

export class VenuePlaceAndUserName1794340000000 implements MigrationInterface {
  name = "VenuePlaceAndUserName1794340000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "venues"
            ADD "address" text
        `);
    await queryRunner.query(`
            ALTER TABLE "venues"
            ADD "mapUrl" text
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "firstName" text
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "firstName"
        `);
    await queryRunner.query(`
            ALTER TABLE "venues" DROP COLUMN "mapUrl"
        `);
    await queryRunner.query(`
            ALTER TABLE "venues" DROP COLUMN "address"
        `);
  }
}
