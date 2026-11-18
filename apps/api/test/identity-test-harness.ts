import { readFileSync } from 'node:fs';
import { buildApiApp } from '../src/composition/build-api-app.js';
import type { IdentityDependencies } from '../src/modules/identity/application/identity-dependencies.js';
import { createBcryptPasswordHasher } from '../src/modules/identity/application/password-hasher.js';
import { createUser } from '../src/modules/identity/application/user-administration.js';
import type { RoleCode } from '../src/modules/identity/domain/role-code.js';
import type { UserAccount } from '../src/modules/identity/persistence/users-repository.js';
import type { Clock } from '../src/platform/clock/clock.js';
import type { Database } from '../src/platform/database/database.js';
import { applyMigrations } from '../src/platform/database/migrations.js';
import { startServer, TEST_WEB_ORIGIN, type RunningServer } from './http-test-server.js';
import { connectTestDatabase } from './test-database.js';

// Costo mínimo de bcrypt: las pruebas validan el flujo, no la resistencia del hash.
const TEST_BCRYPT_COST = 4;
// Seeds versionados que toda base necesita: catálogo de roles y plantilla publicada.
const BASE_SEED_PATHS = [
  '0001_roles.sql',
  '0002_workflow_template_v1.sql',
  '0004_workflow_template_v2.sql',
  '0005_notification_rules.sql',
].map((fileName) => new URL(`../../../sql/seeds/${fileName}`, import.meta.url));
// Tablas que escriben las pruebas, en orden compatible con las claves foráneas.
// La plantilla (workflow_templates, task_definitions, task_dependencies) y los roles se conservan.
const MUTABLE_TABLES = [
  'notification_jobs',
  'notifications',
  'notification_outbox',
  'workflow_notification_rule_sets',
  'workflow_events',
  'task_evidence_submissions',
  'task_instances',
  'workflow_participants',
  'workflow_reprogrammings',
  'workflow_instances',
  'property_source_changes',
  'properties',
  'sync_issues',
  'sync_executions',
  'sync_cursors',
  'user_sessions',
  'user_roles',
  'login_attempts',
  'users',
];

export const SYNTHETIC_PASSWORD = 'Sintetica123';
// Toda prueba empieza en este instante: 12 nov 2026, 09:00 en Santiago.
const TEST_START_INSTANT = '2026-11-12T12:00:00.000Z';

export class FixedClock implements Clock {
  private current: Date;

  constructor(start: string) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  setTo(instant: string): void {
    this.current = new Date(instant);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

// Ejecuta los seeds versionados, para no duplicar su contenido en las pruebas.
// Supone que ningún literal del seed contiene «;».
async function runBaseSeeds(database: Database): Promise<void> {
  for (const seedPath of BASE_SEED_PATHS) {
    const statements = readFileSync(seedPath, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    for (const statement of statements) await database.pool.query(statement);
  }
}

export interface IdentityTestContext {
  readonly database: Database;
  readonly clock: FixedClock;
  readonly dependencies: IdentityDependencies;
  readonly auditEvents: string[];
  readonly server: RunningServer;
  close(): Promise<void>;
}

export async function startIdentityTestContext(): Promise<IdentityTestContext> {
  const database = connectTestDatabase();
  await applyMigrations(database);
  await runBaseSeeds(database);

  const clock = new FixedClock(TEST_START_INSTANT);
  const auditEvents: string[] = [];
  const dependencies: IdentityDependencies = {
    database,
    clock,
    passwordHasher: createBcryptPasswordHasher(TEST_BCRYPT_COST),
    sessionTtlHours: 8,
    recordAudit: (event) => {
      auditEvents.push(event);
    },
  };
  const server = await startServer(
    buildApiApp(dependencies, { allowedOrigin: TEST_WEB_ORIGIN, isSecureCookie: false }),
  );

  return {
    database,
    clock,
    dependencies,
    auditEvents,
    server,
    async close() {
      await server.close();
      await database.close();
    },
  };
}

export async function resetIdentityTables(context: IdentityTestContext): Promise<void> {
  for (const table of MUTABLE_TABLES) await context.database.pool.query(`DELETE FROM ${table}`);
  context.clock.setTo(TEST_START_INSTANT);
  context.auditEvents.length = 0;
}

export async function givenUser(
  context: IdentityTestContext,
  user: { email: string; roles: RoleCode[]; name?: string },
): Promise<UserAccount> {
  const outcome = await createUser(context.dependencies, null, {
    name: user.name ?? 'Usuario Sintético',
    email: user.email,
    password: SYNTHETIC_PASSWORD,
    roles: user.roles,
  });
  if (!outcome.isSuccess) throw new Error(`No se pudo crear el usuario de prueba`);
  return outcome.value;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly rawBody: string;
  readonly setCookie: string | null;
}

export async function callApi(
  context: IdentityTestContext,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options: { body?: unknown; sessionCookie?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { origin: TEST_WEB_ORIGIN };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.sessionCookie) headers.cookie = options.sessionCookie;

  const response = await fetch(`${context.server.baseUrl}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const rawBody = await response.text();
  return {
    status: response.status,
    body: rawBody ? (JSON.parse(rawBody) as unknown) : undefined,
    rawBody,
    setCookie: response.headers.get('set-cookie'),
  };
}

// Inicia sesión y devuelve el par nombre=valor listo para el encabezado Cookie.
export async function logInAs(context: IdentityTestContext, email: string): Promise<string> {
  const response = await callApi(context, 'POST', '/api/auth/login', {
    body: { email, password: SYNTHETIC_PASSWORD },
  });
  const cookie = response.setCookie?.split(';')[0];
  if (response.status !== 200 || !cookie) throw new Error(`El login de prueba falló`);
  return cookie;
}
