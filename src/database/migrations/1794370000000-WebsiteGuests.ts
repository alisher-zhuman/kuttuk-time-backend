import { MigrationInterface, QueryRunner } from "typeorm";

// Website guests (docs/web-version.md): a user without Telegram, logged in by a browser secret.
export class WebsiteGuests1794370000000 implements MigrationInterface {
  name = "WebsiteGuests1794370000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD "guestTokenHash" text
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "UQ_cdd4001e430a8263cccdd124c3c" UNIQUE ("guestTokenHash")
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "telegramId" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "users_guest_is_buyer" CHECK (
                    "telegramId" IS NOT NULL
                    OR "role" = 'user'
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "users_telegram_or_guest" CHECK (
                    ("telegramId" IS NULL) <> ("guestTokenHash" IS NULL)
                )
        `);
  }

  // Website guests can't go back to "every user has a Telegram ID": refuse while any exist
  // (log them in with Telegram, or delete the ones without purchases, first).
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ guests }] = await queryRunner.query(
      `SELECT count(*)::int AS "guests" FROM "users" WHERE "telegramId" IS NULL`,
    );

    if (guests > 0) {
      throw new Error(`WebsiteGuests can't be reverted: ${guests} website guest(s) exist`);
    }

    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_telegram_or_guest"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "users_guest_is_buyer"
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "telegramId"
            SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "UQ_cdd4001e430a8263cccdd124c3c"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "guestTokenHash"
        `);
  }
}
