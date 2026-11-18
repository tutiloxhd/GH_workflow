import { toAdminNewDatabaseSettings, toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import {
  createBcryptPasswordHasher,
  PRODUCTION_BCRYPT_COST,
} from '../modules/identity/application/password-hasher.js';
import { importAdminNewAgentUsers } from '../modules/admin-new-sync/application/import-agent-users.js';
import { connectAdminNewSource } from '../modules/admin-new-sync/persistence/admin-new-source.js';
import { systemClock } from '../platform/clock/clock.js';
import { connectDatabase } from '../platform/database/database.js';

async function run(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some((argument) => argument !== '--apply')) {
    throw new Error('Uso: npm run users:import-admin-new-agents [-- --apply]');
  }
  const shouldApply = argumentsList.includes('--apply');
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  const source = connectAdminNewSource(toAdminNewDatabaseSettings(env));

  try {
    const summary = await importAdminNewAgentUsers(
      {
        database,
        source,
        clock: systemClock,
        passwordHasher: createBcryptPasswordHasher(PRODUCTION_BCRYPT_COST),
      },
      shouldApply,
    );
    process.stdout.write(
      `${JSON.stringify({ mode: shouldApply ? 'APPLY' : 'DRY_RUN', ...summary }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.name : 'Error inesperado';
  process.stderr.write(
    `No se pudo importar agentes de admin_new (${errorType}); se ocultaron los datos de cuenta.\n`,
  );
  process.exitCode = 1;
});
