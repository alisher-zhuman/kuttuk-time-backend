export interface CurrentUser {
  userId: number;
  role: string;
  // null for a website guest (no Telegram account) - always a plain buyer.
  telegramId: number | null;
}
