import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SchedulerRegistry } from "@nestjs/schedule";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { FinikService } from "../../src/finik/finik.service";
import type { CreatePaymentInput } from "../../src/finik/finik.service";
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

export interface TestApp {
  app: INestApplication;
  ds: DataSource;
  finik: FakeFinikService;
  tokenFor: (user: User) => string;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

// The real AppModule (migrations run on boot via DB_SYNC=false), with two substitutions:
// Finik is faked, and the scheduler doesn't register @Cron jobs — a cron firing mid-test
// could change data under it; cron logic is tested by calling the method directly.
export const createTestApp = async (): Promise<TestApp> => {
  const finik = new FakeFinikService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FinikService)
    .useValue(finik)
    .overrideProvider("SCHEDULE_MODULE_OPTIONS")
    .useValue({ cronJobs: false, intervals: false, timeouts: false })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });

  configureApp(app);
  await app.init();

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
    tokenFor: (user) => jwt.sign({ userId: user.id, role: user.role, telegramId: user.telegramId }),
    reset: async () => {
      finik.reset();
      await truncateAll(ds);
    },
    close: () => app.close(),
  };
};
