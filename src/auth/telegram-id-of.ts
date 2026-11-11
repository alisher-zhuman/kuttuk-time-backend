import { ForbiddenException } from "@nestjs/common";

import type { CurrentUser } from "./interfaces/current-user.interface";

// The caller's Telegram ID where one is required (the merchant cabinet - merchants are found by
// it). A website guest has none and is always a plain buyer, so RolesGuard already keeps them
// out of merchant routes; this is the type-level guarantee, and a 403 if that ever changes.
export const telegramIdOf = (user: CurrentUser): number => {
  if (user.telegramId === null) {
    throw new ForbiddenException("This needs a Telegram account");
  }

  return user.telegramId;
};
