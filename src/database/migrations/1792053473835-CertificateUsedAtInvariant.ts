import { MigrationInterface, QueryRunner } from "typeorm";

export class CertificateUsedAtInvariant1792053473835 implements MigrationInterface {
  name = "CertificateUsedAtInvariant1792053473835";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificates"
            ADD CONSTRAINT "certificates_used_at_iff_used" CHECK (("status" = 'used') = ("usedAt" IS NOT NULL))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificates" DROP CONSTRAINT "certificates_used_at_iff_used"
        `);
  }
}
