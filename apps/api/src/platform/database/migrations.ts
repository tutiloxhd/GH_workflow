import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { Database } from './database.js';

// El SQL revisable vive en <repo>/sql/migrations y lo genera `npm run db:generate`.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../../../sql/migrations', import.meta.url));

export async function applyMigrations(database: Database): Promise<void> {
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
}
