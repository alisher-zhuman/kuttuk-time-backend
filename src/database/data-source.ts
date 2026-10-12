import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "./typeorm.options";

// For the TypeORM CLI only (migration:generate/run). Env comes from the shell / --env-file.
export default new DataSource({
  ...buildTypeOrmOptions((key) => process.env[key]),
  synchronize: false,
  migrationsRun: false,
});
