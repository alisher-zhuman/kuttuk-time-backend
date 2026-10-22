import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SchedulerRegistry } from "@nestjs/schedule";
import { getStorageToken, type ThrottlerStorageService } from "@nestjs/throttler";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { FinikService } from "../../src/finik/finik.service";
import type { CreatePaymentInput } from "../../src/finik/finik.service";
import { TelegramBotService, type BotMessage } from "../../src/telegram/telegram-bot.service";
import { CloudinaryService } from "../../src/cloudinary/cloudinary.service";
import type { User } from "../../src/users/entities/user.entity";
import { assertTestDatabase, truncateAll } from "./db";

export class FakeFinikService {
  calls: CreatePaymentInput[] = [];
  failWith: Error | null = null;

  async createPayment(input: CreatePaymentInput): Promise<{ paymentUrl: string }> {
    this.calls.push(input);

    if (this.failWith) {
      throw this.failWith;
    }

    return { paymentUrl: `https://pay.test/${input.paymentId}` };
  }

  reset(): void {
    this.calls = [];
    this.failWith = null;
  }
}

// Records bot messages instead of calling Telegram. `deliver: false` simulates a 403
// (the user never started the bot).
export class FakeTelegramBot {
  sent: BotMessage[] = [];
  deliver = true;

  // Other Bot API methods (setChatMenuButton, …).
  calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  async send(message: BotMessage): Promise<boolean> {
    this.sent.push(message);

    return this.deliver;
  }

  async call(method: string, payload: Record<string, unknown>): Promise<boolean> {
    this.calls.push({ method, payload });

    return this.deliver;
  }

  // What request() returns (e.g. savePreparedInlineMessage's PreparedInlineMessage); null = failed.
  requestResult: unknown = { id: "prepared-1", expiration_date: 1_800_000_000 };

  async request(method: string, payload: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, payload });

    return this.deliver ? this.requestResult : null;
  }

  reset(): void {
    this.sent = [];
    this.calls = [];
    this.deliver = true;
    this.requestResult = { id: "prepared-1", expiration_date: 1_800_000_000 };
  }
}

// Records uploads / deletions instead of calling Cloudinary.
export class FakeCloudinary {
  uploads: string[] = [];
  deleted: string[] = [];

  async uploadFile(file: { originalname: string }) {
    const publicId = `kuttuk-time/fake${this.uploads.length + 1}`;

    this.uploads.push(file.originalname);

    return {
      public_id: publicId,
      secure_url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.webp`,
    };
  }

  async deleteFile(publicId: string): Promise<void> {
    this.deleted.push(publicId);
  }

  reset(): void {
    this.uploads = [];
    this.deleted = [];
  }
}

// For fire-and-forget work (bot messages after a webhook): poll until the condition holds.
export const waitFor = async (condition: () => boolean, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("waitFor: condition not met in time");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

export interface TestApp {
  app: INestApplication;
  ds: DataSource;
  finik: FakeFinikService;
  bot: FakeTelegramBot;
  cloudinary: FakeCloudinary;
  tokenFor: (user: User) => string;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

// The real AppModule (migrations run on boot via DB_SYNC=false), with four substitutions:
// Finik, the Telegram bot and Cloudinary are faked, and the scheduler doesn't register @Cron jobs — a cron firing mid-test
// could change data under it; cron logic is tested by calling the method directly.
export const createTestApp = async (): Promise<TestApp> => {
  const finik = new FakeFinikService();
  const bot = new FakeTelegramBot();
  const cloudinary = new FakeCloudinary();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FinikService)
    .useValue(finik)
    .overrideProvider(TelegramBotService)
    .useValue(bot)
    .overrideProvider(CloudinaryService)
    .useValue(cloudinary)
    .overrideProvider("SCHEDULE_MODULE_OPTIONS")
    .useValue({ cronJobs: false, intervals: false, timeouts: false })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });

  configureApp(app);
  // Listen once on a real port. On a non-listening server Supertest calls listen()/close() per
  // request, so with concurrent requests the first to finish closes the server under the
  // others (ECONNRESET), leaving their transactions running into the next test's TRUNCATE.
  await app.listen(0, "127.0.0.1");

  const ds = app.get(DataSource);

  assertTestDatabase(ds);

  if (app.get(SchedulerRegistry).getCronJobs().size > 0) {
    throw new Error("Cron jobs must not be registered in the test app");
  }

  const jwt = app.get(JwtService);

  return {
    app,
    ds,
    finik,
    bot,
    cloudinary,
    tokenFor: (user) => jwt.sign({ userId: user.id, role: user.role, telegramId: user.telegramId }),
    reset: async () => {
      finik.reset();
      bot.reset();
      cloudinary.reset();
      // TRUNCATE … RESTART IDENTITY hands out user id 1 again, so per-user rate-limit
      // counters (user:1) would otherwise carry over from the previous test.
      const throttlerStorage = app.get<ThrottlerStorageService>(getStorageToken());

      throttlerStorage.storage.clear();
      // Since @nestjs/throttler 6.7 the hit counts are recomputed from a second, private map —
      // clear it too, or the counters survive the reset. Test-only; prod never resets.
      (
        throttlerStorage as unknown as { hitExpirations?: Map<string, unknown> }
      ).hitExpirations?.clear();
      await truncateAll(ds);
    },
    close: () => app.close(),
  };
};
