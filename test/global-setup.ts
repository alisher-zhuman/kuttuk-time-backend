import { generateKeyPairSync } from "node:crypto";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

// globalSetup and globalTeardown share only the global object.
export type ContainerHolder = { __PG_CONTAINER__?: StartedPostgreSqlContainer };

const TEST_DATABASE = "kuttuktime_test";

// One Postgres 18 container per run (prod runs 18). The schema is NOT created here:
// the app boots with DB_SYNC=false, so migrationsRun builds it from our migrations.
export default async (): Promise<void> => {
  const container = await new PostgreSqlContainer("postgres:18")
    .withDatabase(TEST_DATABASE)
    // Durability is irrelevant for a throwaway DB; this makes TRUNCATE/inserts much faster.
    .withCommand([
      "postgres",
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
    ])
    .start();

  (globalThis as ContainerHolder).__PG_CONTAINER__ = container;

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const b64 = (pem: string) => Buffer.from(pem).toString("base64");

  // Explicit process.env beats the local .env (ConfigService and dotenv both prefer it),
  // and CI has no .env at all — so every variable the app reads is set here.
  Object.assign(process.env, {
    NODE_ENV: "test",
    INTEGRATION_DATABASE: TEST_DATABASE,
    DATABASE_HOST: container.getHost(),
    DATABASE_PORT: String(container.getPort()),
    DATABASE_USER: container.getUsername(),
    DATABASE_PASSWORD: container.getPassword(),
    DATABASE_NAME: TEST_DATABASE,
    DATABASE_SSL: "false",
    DB_SYNC: "false",
    JWT_SECRET: "integration-test-secret",
    JWT_EXPIRATION: "2h",
    BOT_TOKEN: "123456:integration-test",
    CLOUDINARY_CLOUD_NAME: "test",
    CLOUDINARY_API_KEY: "test",
    CLOUDINARY_API_SECRET: "test",
    FINIK_BASE_URL: "http://finik.invalid",
    FINIK_API_KEY: "test",
    FINIK_ACCOUNT_ID: "test-account",
    FINIK_PRIVATE_KEY_B64: b64(privateKey),
    FINIK_PUBLIC_KEY_B64: b64(publicKey),
    FINIK_WEBHOOK_URL: "http://localhost/api/finik/webhook",
    FINIK_REDIRECT_URL: "https://t.me/kuttuk_time_bot/app",
  });
};
