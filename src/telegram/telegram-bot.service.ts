import { Injectable, Logger } from "@nestjs/common";

import { botToken } from "./bot-token";

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

// An inline button: opens a link, or copies a text (e.g. a certificate code) to the clipboard.
export type BotButton = { text: string; url: string } | { text: string; copyText: string };

export interface BotMessage {
  chatId: number;
  // HTML parse mode: escape user data with escapeHtml().
  html: string;
  button?: { text: string; url: string };
  // More buttons, one per row, under `button`.
  buttons?: BotButton[];
}

// Bot API InlineKeyboardMarkup, one button per row.
export const inlineKeyboard = (buttons: BotButton[]) => ({
  inline_keyboard: buttons.map((b) => [
    "url" in b ? { text: b.text, url: b.url } : { text: b.text, copy_text: { text: b.copyText } },
  ]),
});

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Best-effort Bot API calls: never throw, return whether Telegram accepted it. A bot can only
// write to someone who started it or allowed it in the Mini App — otherwise Telegram answers 403,
// which is expected and only logged.
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  send({ chatId, html, button, buttons = [] }: BotMessage): Promise<boolean> {
    const all = [...(button ? [button] : []), ...buttons];

    return this.call(
      "sendMessage",
      {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(all.length > 0 ? { reply_markup: inlineKeyboard(all) } : {}),
      },
      `Bot message to ${chatId}`,
    );
  }

  // Any Bot API method (setChatMenuButton, setWebhook, …). `label` names it in the logs.
  async call(method: string, payload: object, label = `Bot ${method}`): Promise<boolean> {
    return (await this.request(method, payload, label)) !== null;
  }

  // Like call(), but returns the method's `result` (null on any failure).
  async request<T = unknown>(
    method: string,
    payload: object,
    label = `Bot ${method}`,
  ): Promise<T | null> {
    const token = botToken();

    if (!token) {
      this.logger.error(`${label} skipped: BOT_TOKEN is not set`);

      return null;
    }

    try {
      const response = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        const { result } = (await response.json().catch(() => ({}))) as { result?: T };

        return result ?? (true as T);
      }

      const { description } = (await response.json().catch(() => ({}))) as {
        description?: string;
      };
      const log = response.status === 403 ? "warn" : "error";

      this.logger[log](`${label} not sent: ${response.status} ${description ?? ""}`);

      return null;
    } catch (error) {
      // Only the error's name/message — never the request URL, it holds the token.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

      this.logger.error(`${label} failed: ${reason}`);

      return null;
    }
  }
}
