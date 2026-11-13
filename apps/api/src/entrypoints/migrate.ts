// Aplica las migraciones pendientes de <repo>/sql/migrations a la base indicada por DB_NAME.
import { toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import { connectDatabase } from '../platform/database/database.js';
import { applyMigrations } from '../platform/database/migrations.js';
import { logger } from '../platform/logging/logger.js';

async function run(): Promise<void> {
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  try {
    await applyMigrations(database);
    logger.info('migrations.applied', { database: env.DB_NAME });
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  logger.error('migrations.failed', error);
  process.exitCode = 1;
});
