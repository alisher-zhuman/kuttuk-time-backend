import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

import { TelegramBotService } from "./telegram-bot.service";

const HOUR_MS = 60 * 60 * 1000;

export interface AdminAlert {
  // What happened - a repeated system alert of the same kind is sent at most once an hour.
  kind: string;
  // HTML, in Russian (the admins' working language); escape user data with escapeHtml().
  html: string;
  // true for system problems that can repeat (a bad webhook signature, Finik down): one message
  // an hour is enough to act on. Alerts about one specific order are never throttled.
  throttle?: boolean;
}

// Immediate bot messages to every admin about what needs a human now: money taken without a
// certificate, a second charge, payments that stop arriving. Best-effort like every bot message:
// never throws, the caller doesn't wait for it. The throttle is in memory - a restart may repeat
// one message, which is fine.
@Injectable()
export class AdminAlertsService {
  private readonly logger = new Logger(AdminAlertsService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bot: TelegramBotService,
  ) {}

  async alert({ kind, html, throttle = false }: AdminAlert, now = Date.now()): Promise<number> {
    try {
      if (throttle) {
        const last = this.lastSent.get(kind);

        if (last !== undefined && now - last < HOUR_MS) {
          return 0;
        }

        this.lastSent.set(kind, now);
      }

      const admins: Array<{ telegramId: string }> = await this.dataSource.query(
        `SELECT "telegramId"::text AS "telegramId" FROM "users" WHERE "role" = 'admin'`,
      );
      let delivered = 0;

      for (const admin of admins) {
        delivered += (await this.bot.send({ chatId: Number(admin.telegramId), html })) ? 1 : 0;
      }

      if (delivered === 0) {
        this.logger.error(`Admin alert "${kind}" reached no admin`);
      }

      return delivered;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.logger.error(`Admin alert "${kind}" failed: ${reason}`);

      return 0;
    }
  }

  // Tests only: a fresh throttle per test.
  resetThrottle(): void {
    this.lastSent.clear();
  }
}
