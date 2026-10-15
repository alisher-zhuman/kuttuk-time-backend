import { MigrationInterface, QueryRunner } from "typeorm";

export class MerchantCategoryIntegrity1792043280467 implements MigrationInterface {
  name = "MerchantCategoryIntegrity1792043280467";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "description"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "slug"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD CONSTRAINT "merchants_nominals_not_empty" CHECK (cardinality("nominals") > 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD CONSTRAINT "merchants_description_langs" CHECK ("description" ?& ARRAY ['ru', 'kg', 'en'])
        `);
    await queryRunner.query(`
            ALTER TABLE "categories"
            ADD CONSTRAINT "categories_name_langs" CHECK ("name" ?& ARRAY ['ru', 'kg', 'en'])
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "categories" DROP CONSTRAINT "categories_name_langs"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP CONSTRAINT "merchants_description_langs"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP CONSTRAINT "merchants_nominals_not_empty"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "slug" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ALTER COLUMN "description" DROP NOT NULL
        `);
  }
}
