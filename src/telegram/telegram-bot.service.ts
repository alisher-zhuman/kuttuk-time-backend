import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

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

export type DeliveryResult = "delivered" | "refused" | "failed";

// Bot API InlineKeyboardMarkup, one button per row.
export const inlineKeyboard = (buttons: BotButton[]) => ({
  inline_keyboard: buttons.map((b) => [
    "url" in b ? { text: b.text, url: b.url } : { text: b.text, copy_text: { text: b.copyText } },
  ]),
});

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Best-effort Bot API calls: never throw, return whether Telegram accepted it. A bot can only
// write to someone who started it or allowed it in the Mini App - otherwise Telegram answers 403,
// which is expected and only logged.
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  // Optional: scripts build this service by hand, without a database - then nothing is recorded.
  constructor(@Optional() @InjectDataSource() private readonly dataSource?: DataSource) {}

  async send(message: BotMessage): Promise<boolean> {
    return (await this.deliverResult(message)) === "delivered";
  }

  // Like send(), but tells a refusal (403 / chat not found - retrying is pointless) from a
  // failure (network, Telegram 5xx - may pass later). Also records on users.botReachable whether
  // the person can be reached (the admin sees it): delivered → true, refused → false.
  async deliverResult({ chatId, html, button, buttons = [] }: BotMessage): Promise<DeliveryResult> {
    // A safety net: callers skip website guests (no Telegram chat); Number(null) would be 0.
    if (!Number.isSafeInteger(chatId) || chatId <= 0) {
      this.logger.error(`Bot message skipped: no Telegram chat (${chatId})`);

      return "refused";
    }

    const all = [...(button ? [button] : []), ...buttons];
    const { result, refused } = await this.attempt(
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
    const delivered = result !== null;

    if (delivered || refused) {
      await this.recordReachable(chatId, delivered);
    }

    return delivered ? "delivered" : refused ? "refused" : "failed";
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
    return (await this.attempt<T>(method, payload, label)).result;
  }

  // refused: Telegram won't deliver to this chat (403 - blocked / never started the bot, or
  // 400 "chat not found"), as opposed to a failure that may pass on a retry.
  private async attempt<T>(
    method: string,
    payload: object,
    label: string,
  ): Promise<{ result: T | null; refused: boolean }> {
    const token = botToken();

    if (!token) {
      this.logger.error(`${label} skipped: BOT_TOKEN is not set`);

      return { result: null, refused: false };
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

        return { result: result ?? (true as T), refused: false };
      }

      const { description } = (await response.json().catch(() => ({}))) as {
        description?: string;
      };
      const log = response.status === 403 ? "warn" : "error";

      this.logger[log](`${label} not sent: ${response.status} ${description ?? ""}`);

      return {
        result: null,
        refused:
          response.status === 403 ||
          (response.status === 400 && /chat not found/i.test(description ?? "")),
      };
    } catch (error) {
      // Only the error's name/message - never the request URL, it holds the token.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

      this.logger.error(`${label} failed: ${reason}`);

      return { result: null, refused: false };
    }
  }

  private async recordReachable(chatId: number, reachable: boolean): Promise<void> {
    try {
      await this.dataSource?.query(
        `UPDATE "users" SET "botReachable" = $2 WHERE "telegramId" = $1 AND "botReachable" IS DISTINCT FROM $2`,
        [chatId, reachable],
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Recording bot reachability for ${chatId} failed: ${reason}`);
    }
  }
}
