import { NotFoundException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";

// The merchant owned by the caller (JWT telegramId = merchants.merchantTelegramId).
// A deactivated merchant still counts: its cabinet and redemption keep working, it's only
// hidden from buyers.
export const ownMerchantId = async (
  db: DataSource | EntityManager,
  merchantTelegramId: number,
): Promise<number> => {
  const [merchant]: Array<{ id: number }> = await db.query(
    `SELECT "id" FROM "merchants" WHERE "merchantTelegramId" = $1`,
    [merchantTelegramId],
  );

  if (!merchant) {
    throw new NotFoundException("Merchant not found");
  }

  return merchant.id;
};
