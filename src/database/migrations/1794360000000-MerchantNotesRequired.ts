import { MigrationInterface, QueryRunner } from "typeorm";

export class MerchantNotesRequired1794360000000 implements MigrationInterface {
  name = "MerchantNotesRequired1794360000000";

  // A merchant's payout details and contact are required since 2026-11-11. On prod all 8 were
  // filled before this deploy (test values); anything left blank meanwhile gets the same
  // placeholder, so the app still boots.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "merchants" SET "payoutDetails" = 'Тестовые реквизиты (заменить)'
             WHERE "payoutDetails" IS NULL OR btrim("payoutDetails") = ''
        `);
    await queryRunner.query(`
            UPDATE "merchants" SET "contact" = 'Тестовый контакт (заменить)'
             WHERE "contact" IS NULL OR btrim("contact") = ''
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "payoutDetails"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "contact"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD CONSTRAINT "merchants_contact_not_blank" CHECK (btrim("contact") <> '')
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD CONSTRAINT "merchants_payout_details_not_blank" CHECK (btrim("payoutDetails") <> '')
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP CONSTRAINT "merchants_payout_details_not_blank"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP CONSTRAINT "merchants_contact_not_blank"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "contact" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "payoutDetails" DROP NOT NULL
        `);
  }
}
