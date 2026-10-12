import { join } from "node:path";
import type { DataSourceOptions } from "typeorm";

type EnvGetter = (key: string) => string | undefined;

// Under ts-node / ts-jest this file is .ts, in dist it is .js. Matching only the current
// extension keeps the migrations glob away from the emitted .d.ts files in dist.
const ext = __filename.endsWith(".ts") ? "ts" : "js";

export const buildTypeOrmOptions = (env: EnvGetter): DataSourceOptions => {
  const synchronize = env("DB_SYNC") === "true";

  return {
    type: "postgres",
    host: env("DATABASE_HOST"),
    port: parseInt(env("DATABASE_PORT") ?? "5432", 10),
    username: env("DATABASE_USER"),
    password: env("DATABASE_PASSWORD"),
    database: env("DATABASE_NAME"),
    ssl: env("DATABASE_SSL") === "true" ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, "..", "**", `*.entity.${ext}`)],
    migrations: [join(__dirname, "migrations", `*.${ext}`)],
    synchronize,
    // synchronize and migrations must never both run against the same schema.
    migrationsRun: !synchronize,
    migrationsTransactionMode: "each",
  };
};
