import { Injectable, Logger } from "@nestjs/common";

import { botToken } from "./bot-token";

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

export interface BotMessage {
  chatId: number;
  // HTML parse mode: escape user data with escapeHtml().
  html: string;
  button?: { text: string; url: string };
}

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Best-effort bot messages: never throws, returns whether Telegram accepted it. A bot can only
// write to someone who started it or allowed it in the Mini App — otherwise Telegram answers 403,
// which is expected and only logged.
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  async send({ chatId, html, button }: BotMessage): Promise<boolean> {
    const token = botToken();

    if (!token) {
      this.logger.error(`Bot message to ${chatId} skipped: BOT_TOKEN is not set`);

      return false;
    }

    try {
      const response = await fetch(`${API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          ...(button
            ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } }
            : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        return true;
      }

      const { description } = (await response.json().catch(() => ({}))) as {
        description?: string;
      };
      const log = response.status === 403 ? "warn" : "error";

      this.logger[log](
        `Bot message to ${chatId} not sent: ${response.status} ${description ?? ""}`,
      );

      return false;
    } catch (error) {
      // Only the error's name/message — never the request URL, it holds the token.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

      this.logger.error(`Bot message to ${chatId} failed: ${reason}`);

      return false;
    }
  }
}
