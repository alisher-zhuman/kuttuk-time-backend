import { MigrationInterface, QueryRunner } from "typeorm";

export class BotDigests1792584683240 implements MigrationInterface {
  name = "BotDigests1792584683240";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "bot_digests" (
                "id" SERIAL NOT NULL,
                "kind" text NOT NULL,
                "periodFrom" date NOT NULL,
                "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "bot_digests_kind_period" UNIQUE ("kind", "periodFrom"),
                CONSTRAINT "PK_f450f4aa703edce2049e81ea8b6" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "bot_digests"
        `);
  }
}
