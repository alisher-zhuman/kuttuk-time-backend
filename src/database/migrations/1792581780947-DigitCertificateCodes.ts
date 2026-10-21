import { MigrationInterface, QueryRunner } from "typeorm";

// Certificate codes become 8 digits (2026-10-21; see src/certificates/certificate-code.ts).
// Every old KT-XXXX-XXXX code (only test data existed) gets a new random 8-digit code, then a
// CHECK makes 8 digits the only format the table accepts. The digits come from gen_random_uuid()
// (cryptographically random, built into Postgres 13+), retried on a collision.
// down() only drops the CHECK — the old codes are not restored.
export class DigitCertificateCodes1792581780947 implements MigrationInterface {
  name = "DigitCertificateCodes1792581780947";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        cert record;
        candidate text;
      BEGIN
        FOR cert IN SELECT "id" FROM "certificates" WHERE "code" !~ '^[0-9]{8}$' LOOP
          LOOP
            candidate := lpad(
              ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint)
                % 100000000)::text,
              8, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM "certificates" WHERE "code" = candidate);
          END LOOP;
          UPDATE "certificates" SET "code" = candidate WHERE "id" = cert."id";
        END LOOP;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "certificates"
      ADD CONSTRAINT "certificates_code_format" CHECK ("code" ~ '^[0-9]{8}$')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "certificates" DROP CONSTRAINT "certificates_code_format"`,
    );
  }
}
