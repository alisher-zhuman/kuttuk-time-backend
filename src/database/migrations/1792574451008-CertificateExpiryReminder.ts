import { MigrationInterface, QueryRunner } from "typeorm";

export class CertificateExpiryReminder1792574451008 implements MigrationInterface {
  name = "CertificateExpiryReminder1792574451008";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificates"
            ADD "expiryRemindedAt" TIMESTAMP WITH TIME ZONE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificates" DROP COLUMN "expiryRemindedAt"
        `);
  }
}
