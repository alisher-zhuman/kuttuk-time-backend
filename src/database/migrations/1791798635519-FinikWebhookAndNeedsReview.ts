import { MigrationInterface, QueryRunner } from "typeorm";

export class FinikWebhookAndNeedsReview1791798635519 implements MigrationInterface {
  name = "FinikWebhookAndNeedsReview1791798635519";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "finik_webhook_events" (
                "id" uuid NOT NULL,
                "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "signatureValid" boolean NOT NULL,
                "headers" json NOT NULL,
                "body" json NOT NULL,
                "result" text NOT NULL,
                "orderId" uuid,
                CONSTRAINT "PK_59b6d4561f46a6b2450b62b56f6" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_e35c78219e166111f8c27103da" ON "finik_webhook_events" ("orderId")
        `);
    // Hand-edited: TypeORM generated a rename/recreate of the enum that rewrites orders.status
    // (ACCESS EXCLUSIVE lock, index dropped and rebuilt). ADD VALUE appends in place, no rewrite;
    // allowed inside a transaction on PG 12+ as long as the new value isn't used in it.
    await queryRunner.query(`
            ALTER TYPE "public"."orders_status_enum" ADD VALUE 'needs_review'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a827e8437c6ddac993842cc32f"
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."orders_status_enum_old" AS ENUM('pending', 'paid', 'expired')
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
            DROP INDEX "public"."IDX_e35c78219e166111f8c27103da"
        `);
    await queryRunner.query(`
            DROP TABLE "finik_webhook_events"
        `);
  }
}
