import type { Env } from '../config/env.js';
import type { IdentityDependencies } from '../modules/identity/application/identity-dependencies.js';
import {
  createBcryptPasswordHasher,
  PRODUCTION_BCRYPT_COST,
} from '../modules/identity/application/password-hasher.js';
import { systemClock } from '../platform/clock/clock.js';
import type { Database } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

export function identityDependenciesFromEnv(env: Env, database: Database): IdentityDependencies {
  return {
    database,
    clock: systemClock,
    passwordHasher: createBcryptPasswordHasher(PRODUCTION_BCRYPT_COST),
    sessionTtlHours: env.SESSION_TTL_HOURS,
    recordAudit: (event, context) => {
      logger.info(event, context);
    },
  };
}

// La cookie solo se emite sin Secure en desarrollo local, que corre por HTTP.
export const usesSecureCookies = (env: Env): boolean => env.NODE_ENV === 'production';
