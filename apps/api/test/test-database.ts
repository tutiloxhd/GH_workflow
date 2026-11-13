import { parseEnv } from '../src/config/env.js';
import { connectDatabase, type Database } from '../src/platform/database/database.js';

// Las pruebas de integración usan una base propia (DB_TEST_NAME), nunca la de desarrollo ni admin_new.
export function connectTestDatabase(): Database {
  process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const testDatabaseName = process.env.DB_TEST_NAME;

  if (!testDatabaseName || !/^[A-Za-z0-9_]+$/.test(testDatabaseName)) {
    throw new Error('DB_TEST_NAME debe definir la base de pruebas');
  }
  if (testDatabaseName === env.DB_NAME || testDatabaseName === env.ADMIN_NEW_DB_NAME) {
    throw new Error('DB_TEST_NAME debe ser distinta de DB_NAME y de ADMIN_NEW_DB_NAME');
  }

  return connectDatabase({
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: testDatabaseName,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
}
