import { defineConfig } from 'drizzle-kit';

// Solo se usa para generar SQL revisable (npm run db:generate); no necesita credenciales.
export default defineConfig({
  dialect: 'mysql',
  schema: './src/platform/database/schema/*.schema.ts',
  out: '../../sql/migrations',
});
