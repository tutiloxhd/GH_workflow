import type { DatabaseSettings } from '../platform/database/database.js';
import type { Env } from './env.js';

export function toDatabaseSettings(env: Env): DatabaseSettings {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  };
}

// Conexión a admin_new: hereda de DB_* lo que no se configure por separado.
export function toAdminNewDatabaseSettings(env: Env): DatabaseSettings {
  return {
    host: env.ADMIN_NEW_DB_HOST ?? env.DB_HOST,
    port: env.ADMIN_NEW_DB_PORT ?? env.DB_PORT,
    name: env.ADMIN_NEW_DB_NAME,
    user: env.ADMIN_NEW_DB_USER ?? env.DB_USER,
    password: env.ADMIN_NEW_DB_PASSWORD ?? env.DB_PASSWORD,
  };
}
