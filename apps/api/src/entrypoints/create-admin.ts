// Crea un usuario con rol ADMIN desde la consola. Es la única forma de crear el primer administrador.
// Uso: ADMIN_INITIAL_PASSWORD=... npm run users:create-admin -- --email <email> --name "<nombre>"
// La contraseña se recibe por variable de entorno de esa sola ejecución para no dejarla en el
// historial de la terminal como argumento ni en el archivo .env.
import { parseArgs } from 'node:util';
import { identityDependenciesFromEnv } from '../composition/identity-dependencies-from-env.js';
import { toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import { createUser } from '../modules/identity/application/user-administration.js';
import { ADMIN_ROLE } from '../modules/identity/domain/role-code.js';
import { connectDatabase } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

async function run(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!values.email || !values.name || !password) {
    throw new Error('Faltan --email, --name o la variable ADMIN_INITIAL_PASSWORD');
  }

  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  try {
    const outcome = await createUser(identityDependenciesFromEnv(env, database), null, {
      name: values.name,
      email: values.email,
      password,
      roles: [ADMIN_ROLE],
    });
    if (!outcome.isSuccess) {
      const { failure } = outcome;
      const detail =
        failure.code === 'PASSWORD_POLICY_VIOLATION' ? failure.violations.join(', ') : '';
      throw new Error(`No se creó el administrador: ${failure.code} ${detail}`.trim());
    }
    logger.info('identity.initial_admin_created', { userId: outcome.value.id });
  } finally {
    await database.close();
  }
}

run().catch((error: unknown) => {
  logger.error('identity.create_admin_failed', error);
  process.exitCode = 1;
});
