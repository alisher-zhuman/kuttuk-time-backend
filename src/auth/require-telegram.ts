import { ForbiddenException } from "@nestjs/common";

import type { CurrentUser } from "./interfaces/current-user.interface";

// The website asks for «Войти через Telegram» before buying and before claiming a gift (the
// user's decision 2026-11-11): a website guest may only browse. A guest's purchase got lost
// when the browser came back from the payment in another tab - with a Telegram account the
// certificate is always found again, and the bot can send the code and reminders.
export const requireTelegram = (user: CurrentUser): void => {
  if (user.telegramId === null) {
    throw new ForbiddenException({
      message: "Log in with Telegram first",
      error: "telegram_required",
    });
  }
};
