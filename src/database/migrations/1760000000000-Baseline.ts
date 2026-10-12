import type { MigrationInterface, QueryRunner } from "typeorm";

// Schema as it existed on prod before migrations were introduced (pg_dump, 2026-10-12).
// Prod already has these tables, so there this migration only gets recorded as applied;
// on an empty database (local, tests) it creates the exact same schema.
const TABLES = ["users", "merchants", "categories"];

export class Baseline1760000000000 implements MigrationInterface {
  name = "Baseline1760000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ table: string | null }> = await queryRunner.query(
      `SELECT to_regclass('public.' || t)::text AS "table" FROM unnest($1::text[]) AS t`,
      [TABLES],
    );
    const existing = rows.filter((row) => row.table !== null).length;

    if (existing === TABLES.length) {
      return;
    }

    if (existing > 0) {
      throw new Error(
        `Baseline: only ${existing}/${TABLES.length} of ${TABLES.join(", ")} exist — refusing to guess`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM ('user', 'merchant', 'admin')`,
    );

    await queryRunner.query(`
      CREATE TABLE "public"."categories" (
        "id" SERIAL NOT NULL,
        "name" jsonb NOT NULL,
        "order" integer DEFAULT 0 NOT NULL,
        CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "public"."merchants" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "description" jsonb,
        "merchantTelegramId" bigint CONSTRAINT "merchants_ownerTelegramId_not_null" NOT NULL,
        "isActive" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
        "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
        "nominals" integer[] NOT NULL,
        "validityMonths" integer DEFAULT 12 NOT NULL,
        "logo" text NOT NULL,
        "slug" text,
        "categories" integer[] NOT NULL,
        CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dbc92b7610efaa5d63a5d4bc604" UNIQUE ("merchantTelegramId"),
        CONSTRAINT "merchants_slug_key" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "merchants_categories_idx" ON "public"."merchants" USING gin ("categories")`,
    );

    await queryRunner.query(`
      CREATE TABLE "public"."users" (
        "id" SERIAL NOT NULL,
        "telegramId" bigint NOT NULL,
        "role" "public"."users_role_enum" DEFAULT 'user' NOT NULL,
        "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_df18d17f84763558ac84192c754" UNIQUE ("telegramId")
      )
    `);
  }

  public async down(): Promise<void> {
    // Reverting would drop every prod table with its data.
    throw new Error("Baseline migration is not reversible");
  }
}
