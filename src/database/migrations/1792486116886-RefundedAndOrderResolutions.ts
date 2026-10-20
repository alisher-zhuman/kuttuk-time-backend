import { MigrationInterface, QueryRunner } from "typeorm";

export class RefundedAndOrderResolutions1792486116886 implements MigrationInterface {
  name = "RefundedAndOrderResolutions1792486116886";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."order_resolutions_action_enum" AS ENUM('issue', 'refunded')
        `);
    await queryRunner.query(`
            CREATE TABLE "order_resolutions" (
                "id" uuid NOT NULL,
                "orderId" uuid NOT NULL,
                "action" "public"."order_resolutions_action_enum" NOT NULL,
                "fromStatus" text NOT NULL,
                "toStatus" text NOT NULL,
                "certificateCode" text,
                "note" text,
                "resolvedBy" text NOT NULL,
                "resolvedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_88669f027989b81ea75d35ab732" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f30612d3294d07446a613e6ed5" ON "order_resolutions" ("orderId")
        `);
    // Hand-edited: TypeORM generated a rename/recreate of the enum that rewrites orders.status
    // (ACCESS EXCLUSIVE lock, index dropped and rebuilt). ADD VALUE appends in place, no rewrite;
    // allowed inside a transaction on PG 12+ as long as the new value isn't used in it.
    await queryRunner.query(`
            ALTER TYPE "public"."orders_status_enum" ADD VALUE 'refunded'
        `);
    await queryRunner.query(`
            ALTER TABLE "order_resolutions"
            ADD CONSTRAINT "FK_f30612d3294d07446a613e6ed52" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "order_resolutions" DROP CONSTRAINT "FK_f30612d3294d07446a613e6ed52"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a827e8437c6ddac993842cc32f"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."orders_status_enum_old" AS ENUM('pending', 'paid', 'expired', 'needs_review')
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ALTER COLUMN "status" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ALTER COLUMN "status" TYPE "public"."orders_status_enum_old" USING "status"::"text"::"public"."orders_status_enum_old"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ALTER COLUMN "status"
            SET DEFAULT 'pending'
        `);
    await queryRunner.query(`
            DROP TYPE "public"."orders_status_enum"
        `);
    await queryRunner.query(`
            ALTER TYPE "public"."orders_status_enum_old"
            RENAME TO "orders_status_enum"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a827e8437c6ddac993842cc32f" ON "orders" ("status", "expiresAt")
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f30612d3294d07446a613e6ed5"
        `);
    await queryRunner.query(`
            DROP TABLE "order_resolutions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."order_resolutions_action_enum"
        `);
  }
}
