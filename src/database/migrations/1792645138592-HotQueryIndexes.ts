import { MigrationInterface, QueryRunner } from "typeorm";

export class HotQueryIndexes1792645138592 implements MigrationInterface {
  name = "HotQueryIndexes1792645138592";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE INDEX "IDX_b1d5c82df91a11f84d70c79a8c" ON "venues" ("merchantId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_aea1e18f5054f22244c8f0fcf0" ON "orders" ("createdAt", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c6f32226dabc1fa6231d4f5d08" ON "orders" ("merchantId", "paidAt")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f44afedb9c57ed6e96afbd6eae" ON "certificates" ("venueId", "createdAt")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bb3f8a58bd1170f19298305e5c" ON "certificates" ("ownerUserId", "createdAt")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bb3f8a58bd1170f19298305e5c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f44afedb9c57ed6e96afbd6eae"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c6f32226dabc1fa6231d4f5d08"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_aea1e18f5054f22244c8f0fcf0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b1d5c82df91a11f84d70c79a8c"
        `);
  }
}
