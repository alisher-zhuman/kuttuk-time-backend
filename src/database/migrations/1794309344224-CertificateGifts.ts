import { MigrationInterface, QueryRunner } from "typeorm";

export class CertificateGifts1794309344224 implements MigrationInterface {
  name = "CertificateGifts1794309344224";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "certificate_gifts" (
                "id" uuid NOT NULL,
                "certificateId" uuid NOT NULL,
                "fromUserId" integer NOT NULL,
                "tokenHash" text NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "claimedAt" TIMESTAMP WITH TIME ZONE,
                "claimedByUserId" integer,
                CONSTRAINT "UQ_30f323fa3fd914698a1f40021fe" UNIQUE ("tokenHash"),
                CONSTRAINT "certificate_gifts_claimed_together" CHECK (
                    ("claimedAt" IS NULL) = ("claimedByUserId" IS NULL)
                ),
                CONSTRAINT "PK_4bae139e59809684ea7bce2fa84" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_98913590a2ce66afe7330a0803" ON "certificate_gifts" ("fromUserId")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "certificate_gifts_one_open" ON "certificate_gifts" ("certificateId")
            WHERE "claimedAt" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts"
            ADD CONSTRAINT "FK_588ad6b2d8a2350f81d06f255d5" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts"
            ADD CONSTRAINT "FK_98913590a2ce66afe7330a08034" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts"
            ADD CONSTRAINT "FK_d7cbe2f32d003bbb1bcdcfd9fb6" FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts" DROP CONSTRAINT "FK_d7cbe2f32d003bbb1bcdcfd9fb6"
        `);
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts" DROP CONSTRAINT "FK_98913590a2ce66afe7330a08034"
        `);
    await queryRunner.query(`
            ALTER TABLE "certificate_gifts" DROP CONSTRAINT "FK_588ad6b2d8a2350f81d06f255d5"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."certificate_gifts_one_open"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_98913590a2ce66afe7330a0803"
        `);
    await queryRunner.query(`
            DROP TABLE "certificate_gifts"
        `);
  }
}
