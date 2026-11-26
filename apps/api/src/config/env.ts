import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
// Los nombres de base se interpolan como identificadores SQL; solo se aceptan caracteres seguros.
const databaseName = z.string().regex(/^[A-Za-z0-9_]+$/);
// Origen exacto del frontend (esquema, host y puerto, sin ruta), p. ej. http://localhost:4200.
const webOrigin = z.url().refine((value) => new URL(value).origin === value);
const httpsOrigin = webOrigin.refine((value) => value.startsWith('https://'));

const DEFAULT_SESSION_TTL_HOURS = 8;
const MAX_SESSION_TTL_HOURS = 24;
// Frecuencia provisoria del sincronizador (ADR 0007).
const DEFAULT_SYNC_INTERVAL_SECONDS = 60;
const MIN_SYNC_INTERVAL_SECONDS = 10;
const MAX_SYNC_INTERVAL_SECONDS = 3600;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: port,
  DB_HOST: z.string().min(1),
  DB_PORT: port,
  DB_NAME: databaseName,
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  ADMIN_NEW_DB_NAME: databaseName,
  // Conexión de solo lectura a admin_new. Si no se indica, se usa la misma de DB_*; en
  // producción debe ser un usuario con solo SELECT sobre las tablas de origen.
  ADMIN_NEW_DB_HOST: z.string().min(1).optional(),
  ADMIN_NEW_DB_PORT: port.optional(),
  ADMIN_NEW_DB_USER: z.string().min(1).optional(),
  ADMIN_NEW_DB_PASSWORD: z.string().min(1).optional(),
  SYNC_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_SYNC_INTERVAL_SECONDS)
    .max(MAX_SYNC_INTERVAL_SECONDS)
    .default(DEFAULT_SYNC_INTERVAL_SECONDS),
  WEB_ORIGIN: webOrigin,
  WEB_ADDITIONAL_ORIGIN: httpsOrigin.optional(),
  PUSH_VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/).+/).optional(),
  PUSH_VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/).optional(),
  PUSH_VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SESSION_TTL_HOURS)
    .default(DEFAULT_SESSION_TTL_HOURS),
}).superRefine((env, context) => {
  const configured = [env.PUSH_VAPID_SUBJECT, env.PUSH_VAPID_PUBLIC_KEY, env.PUSH_VAPID_PRIVATE_KEY];
  if (configured.some(Boolean) && !configured.every(Boolean)) {
    for (const variable of ['PUSH_VAPID_SUBJECT', 'PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY']) {
      context.addIssue({ code: 'custom', path: [variable], message: 'Configurar las tres variables Web Push' });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: readonly string[]) {
    // Solo se informan los nombres: los valores pueden ser secretos.
    super(`Variables de entorno faltantes o inválidas: ${variableNames.join(', ')}`);
    this.name = 'InvalidEnvError';
    this.variableNames = variableNames;
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const variableNames = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  throw new InvalidEnvError(variableNames);
}
