import { MigrationInterface, QueryRunner } from "typeorm";

export class UserLanguage1792555538900 implements MigrationInterface {
  name = "UserLanguage1792555538900";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "language" text
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "users_language_valid" CHECK ("language" IN ('ru', 'kg', 'en'))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_language_valid"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "language"
        `);
  }
}
