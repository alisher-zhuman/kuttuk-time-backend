import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import {
  botLanguage,
  fallbackMessage,
  menuButtonText,
  openButton,
  welcomeMessage,
} from "./bot-texts";
import { SUPPORT_URL } from "./links";
import { TelegramBotService } from "./telegram-bot.service";
import { finikConfig } from "@/finik/finik.config";
import { miniAppLink } from "@/orders/payment-redirect-url";

const SLUG = /^[a-z0-9-]{1,64}$/;

// The parts of a Telegram Update we use (https://core.telegram.org/bots/api#update).
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { language_code?: string; is_bot?: boolean };
  };
}

// The bot doesn't chat: /start gets a welcome with an "open the app" button (straight into a
// venue for /start <slug>), anything else — the same button and the support contact. Private
// chats only. Best-effort: never throws (the webhook already answered 200).
@Injectable()
export class BotUpdatesService {
  private readonly logger = new Logger(BotUpdatesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
    @Inject(finikConfig.KEY) private readonly finik: ConfigType<typeof finikConfig>,
  ) {}

  async handle(update: TelegramUpdate): Promise<void> {
    try {
      const message = update.message;
      const chatId = message?.chat?.id;

      if (
        !message ||
        typeof chatId !== "number" ||
        message.chat?.type !== "private" ||
        message.from?.is_bot
      ) {
        return;
      }

      const lang = botLanguage(message.from?.language_code);
      const text = message.text?.trim() ?? "";
      const [command, param] = text.split(/\s+/, 2);

      if (command === "/start") {
        const venue = param && SLUG.test(param) ? await this.visibleVenue(param) : null;

        await this.bot.send({
          chatId,
          html: welcomeMessage(lang),
          button: {
            text: openButton(lang, venue?.name),
            url: this.appLink(venue ? param : undefined),
          },
        });
        await this.setMenuButton(chatId, lang);

        return;
      }

      await this.bot.send({
        chatId,
        html: fallbackMessage(lang, SUPPORT_URL.replace("https://t.me/", "@")),
        button: { text: openButton(lang), url: this.appLink() },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Bot update ${update.update_id ?? "?"} failed: ${reason}`);
    }
  }

  // The Mini App link; with a slug — that venue (the same startapp=<slug> as GET /:slug).
  private appLink(slug?: string): string {
    return miniAppLink(this.finik.redirectUrl, slug);
  }

  private async visibleVenue(slug: string): Promise<{ name: string } | null> {
    const [venue]: Array<{ name: string }> = await this.dataSource.query(
      `SELECT v."name" FROM "venues" v JOIN "merchants" m ON m."id" = v."merchantId"
        WHERE v."slug" = $1 AND v."isActive" AND m."isActive"`,
      [slug],
    );

    return venue ?? null;
  }

  // The menu button in this chat's language. The Bot API has one default text for everyone
  // (set by bot:setup), but a per-chat button can have its own — so set it here. Needs the
  // Mini App's https URL (MINI_APP_URL); without it the default button stays.
  private async setMenuButton(chatId: number, lang: ReturnType<typeof botLanguage>): Promise<void> {
    const url = process.env.MINI_APP_URL?.trim();

    if (!url) {
      return;
    }

    await this.bot.call("setChatMenuButton", {
      chat_id: chatId,
      menu_button: { type: "web_app", text: menuButtonText(lang), web_app: { url } },
    });
  }
}
