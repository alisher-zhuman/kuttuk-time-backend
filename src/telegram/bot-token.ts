// The bot's token: verifies log-in initData and sends bot messages. Read on every use, so a
// missing value fails each call (log-in refused, message skipped) instead of the boot.
export const botToken = (): string | null => process.env.BOT_TOKEN?.trim() || null;
