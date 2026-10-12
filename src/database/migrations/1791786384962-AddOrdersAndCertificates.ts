import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrdersAndCertificates1791786384962 implements MigrationInterface {
  name = "AddOrdersAndCertificates1791786384962";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'paid', 'expired')
        `);
    await queryRunner.query(`
            CREATE TABLE "orders" (
                "id" uuid NOT NULL,
                "userId" integer NOT NULL,
                "merchantId" integer NOT NULL,
                "amount" integer NOT NULL,
                "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending',
                "paymentUrl" text,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "paidAt" TIMESTAMP WITH TIME ZONE,
                "finikTransactionId" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_137e915213fe910134cf5f75387" UNIQUE ("finikTransactionId"),
                CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a827e8437c6ddac993842cc32f" ON "orders" ("status", "expiresAt")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_30e6836e8539f85bfc47198067" ON "orders" ("userId", "createdAt")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."certificates_status_enum" AS ENUM('active', 'used', 'expired')
        `);
    await queryRunner.query(`
            CREATE TABLE "certificates" (
                "id" uuid NOT NULL,
                "code" text NOT NULL,
                "orderId" uuid NOT NULL,
                "merchantId" integer NOT NULL,
                "ownerUserId" integer NOT NULL,
                "amount" integer NOT NULL,
                "status" "public"."certificates_status_enum" NOT NULL DEFAULT 'active',
                "validUntil" TIMESTAMP WITH TIME ZONE NOT NULL,
                "usedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e9e6937f74d9a653f0fc3299132" UNIQUE ("code"),
                CONSTRAINT "REL_095ce953d5f237d1eb07c20949" UNIQUE ("orderId"),
                CONSTRAINT "PK_e4c7e31e2144300bea7d89eb165" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_c9e4efcabb250e585daa4c19624" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "certificates"
            ADD CONSTRAINT "FK_095ce953d5f237d1eb07c209499" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "certificates"
            ADD CONSTRAINT "FK_8080d50576090a9937b93d5eb93" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "certificates"
            ADD CONSTRAINT "FK_5f1329576a975379e4265ecdf8f" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificates" DROP CONSTRAINT "FK_5f1329576a975379e4265ecdf8f"
        `);
    await queryRunner.query(`
            ALTER TABLE "certificates" DROP CONSTRAINT "FK_8080d50576090a9937b93d5eb93"
        `);
    await queryRunner.query(`
            ALTER TABLE "certificates" DROP CONSTRAINT "FK_095ce953d5f237d1eb07c209499"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_c9e4efcabb250e585daa4c19624"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"
        `);
    await queryRunner.query(`
            DROP TABLE "certificates"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."certificates_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_30e6836e8539f85bfc47198067"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a827e8437c6ddac993842cc32f"
        `);
    await queryRunner.query(`
            DROP TABLE "orders"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."orders_status_enum"
        `);
  }
}
