import { MigrationInterface, QueryRunner } from "typeorm";

export class AdminSupportFields1794330000000 implements MigrationInterface {
  name = "AdminSupportFields1794330000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD "payoutDetails" text
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants"
            ADD "contact" text
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "botReachable" boolean
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "botReachable"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "lastSeenAt"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP COLUMN "contact"
        `);
    await queryRunner.query(`
            ALTER TABLE "merchants" DROP COLUMN "payoutDetails"
        `);
  }
}
