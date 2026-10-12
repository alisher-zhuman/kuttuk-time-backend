import { DataSource, type DataSourceOptions } from "typeorm";

import { buildTypeOrmOptions } from "../../src/database/typeorm.options";

// Refuses to touch anything but the Testcontainers database (e.g. if the local .env leaked in).
export const assertTestDatabase = (ds: DataSource): void => {
  const options = ds.options as DataSourceOptions & { database?: string; host?: string };
  const expected = process.env.INTEGRATION_DATABASE;

  if (!expected || options.database !== expected || options.host !== process.env.DATABASE_HOST) {
    throw new Error(
      `Integration tests must run against the test container, got database="${options.database}" host="${options.host}"`,
    );
  }

  if (options.synchronize) {
    throw new Error("Integration tests must build the schema via migrations, not synchronize");
  }
};

// Same options builder as the app: DB_SYNC=false → migrations run on initialize.
export const openTestDataSource = async (): Promise<DataSource> => {
  const ds = new DataSource(buildTypeOrmOptions((key) => process.env[key]));

  assertTestDatabase(ds);
  await ds.initialize();

  return ds;
};

// Every entity table, i.e. everything except TypeORM's own `migrations` table.
export const truncateAll = async (ds: DataSource): Promise<void> => {
  assertTestDatabase(ds);

  const tables = ds.entityMetadatas.map((meta) => `"${meta.tableName}"`).join(", ");

  await ds.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};
