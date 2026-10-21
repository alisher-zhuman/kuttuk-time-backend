import { MigrationInterface, QueryRunner } from "typeorm";

export class Payouts1792570881461 implements MigrationInterface {
  name = "Payouts1792570881461";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "payouts" (
                "id" uuid NOT NULL,
                "merchantId" integer NOT NULL,
                "periodFrom" date NOT NULL,
                "periodTo" date NOT NULL,
                "ordersCount" integer NOT NULL,
                "gross" integer NOT NULL,
                "commission" integer NOT NULL,
                "payout" integer NOT NULL,
                "note" text,
                "paidBy" integer NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "payouts_period_valid" CHECK ("periodFrom" <= "periodTo"),
                CONSTRAINT "payouts_sums_add_up" CHECK (
                    "payout" + "commission" = "gross"
                    AND "ordersCount" > 0
                ),
                CONSTRAINT "PK_76855dc4f0a6c18c72eea302e87" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_b277d0256318abb9e080e9ae8b" ON "payouts" ("merchantId", "periodFrom")
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD "payoutId" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "orders_payout_only_paid" CHECK (
                    "payoutId" IS NULL
                    OR "status" = 'paid'
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "payouts"
            ADD CONSTRAINT "FK_a262d9381427a31e8488636d543" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "payouts"
            ADD CONSTRAINT "FK_6f9c8e630cb504b78c45de4be3b" FOREIGN KEY ("paidBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_7925c67b003bc2b7ba511412b94" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_7925c67b003bc2b7ba511412b94"
        `);
    await queryRunner.query(`
            ALTER TABLE "payouts" DROP CONSTRAINT "FK_6f9c8e630cb504b78c45de4be3b"
        `);
    await queryRunner.query(`
            ALTER TABLE "payouts" DROP CONSTRAINT "FK_a262d9381427a31e8488636d543"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "orders_payout_only_paid"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP COLUMN "payoutId"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b277d0256318abb9e080e9ae8b"
        `);
    await queryRunner.query(`
            DROP TABLE "payouts"
        `);
  }
}
