import { MigrationInterface, QueryRunner } from "typeorm";

// Since 2026-11-10 a certificate is valid to the end of its last day in Bishkek (see
// certificateValidUntil): «Действует до 10.11.2027» = the whole of 10.11. Existing certificates
// ended at the time of day they were bought - move each to 23:59:59.999 Bishkek of the day it
// already shows. The shown date doesn't change; a certificate only gets longer, never shorter.
export class CertificateValidToEndOfDay1794320000000 implements MigrationInterface {
  name = "CertificateValidToEndOfDay1794320000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "certificates"
         SET "validUntil" = ((("validUntil" AT TIME ZONE 'Asia/Bishkek')::date + 1)::timestamp
                             - interval '1 millisecond') AT TIME ZONE 'Asia/Bishkek'
    `);
  }

  public async down(): Promise<void> {
    // Nothing to undo: the old times of day aren't kept, and the longer validity is harmless
    // (the shown dates are the same). Reverting the code keeps these values.
  }
}
