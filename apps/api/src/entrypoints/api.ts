import { buildApiApp } from '../composition/build-api-app.js';
import {
  identityDependenciesFromEnv,
  usesSecureCookies,
} from '../composition/identity-dependencies-from-env.js';
import { toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import { connectDatabase } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

function start(): void {
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));

  const app = buildApiApp(identityDependenciesFromEnv(env, database), {
    allowedOrigin: env.WEB_ORIGIN,
    isSecureCookie: usesSecureCookies(env),
  });

  const server = app.listen(env.PORT, () => {
    logger.info('api.started', { port: env.PORT, environment: env.NODE_ENV });
  });

  const shutDown = (signal: string) => {
    logger.info('api.stopping', { signal });
    server.close(() => {
      database.close().catch((error: unknown) => {
        logger.error('api.database_close_failed', error);
      });
    });
  };
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
}

try {
  start();
} catch (error) {
  logger.error('api.start_failed', error);
  process.exitCode = 1;
}
