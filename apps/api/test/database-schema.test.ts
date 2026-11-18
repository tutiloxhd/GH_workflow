import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { applyMigrations } from '../src/platform/database/migrations.js';
import { connectTestDatabase } from './test-database.js';

const MVP_TABLES = [
  'login_attempts',
  'notifications',
  'notification_jobs',
  'notification_outbox',
  'notification_rules',
  'notification_rule_sets',
  'properties',
  'property_source_changes',
  'roles',
  'sync_cursors',
  'sync_executions',
  'sync_issues',
  'task_definitions',
  'task_dependencies',
  'task_evidence_submissions',
  'task_instances',
  'users',
  'user_roles',
  'user_sessions',
  'workflow_events',
  'workflow_instances',
  'workflow_notification_rule_sets',
  'workflow_participants',
  'workflow_reprogrammings',
  'workflow_templates',
];

describe('esquema inicial de la base', () => {
  let database: Database;

  beforeAll(async () => {
    database = connectTestDatabase();
    await applyMigrations(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it('crea las 25 tablas del modelo MVP', async () => {
    const [rows] = await database.pool.query<RowDataPacket[]>(
      `SELECT table_name AS tableName
         FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'
        ORDER BY table_name`,
    );

    expect(rows.map((row) => row.tableName as string)).toEqual(MVP_TABLES);
  });

  it('aplicar las migraciones dos veces no falla ni duplica', async () => {
    await expect(applyMigrations(database)).resolves.toBeUndefined();
  });

  it.each([
    ['users', 'email'],
    ['user_sessions', 'token_hash'],
    ['properties', 'admin_new_id'],
    ['workflow_instances', 'property_id'],
    ['task_evidence_submissions', 'task_instance_id'],
  ])('%s.%s tiene restricción única propia', async (tableName, columnName) => {
    const [rows] = await database.pool.query<RowDataPacket[]>(
      `SELECT index_name AS indexName
         FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND non_unique = 0
        GROUP BY index_name
       HAVING COUNT(*) = 1 AND MAX(column_name) = ?`,
      [tableName, columnName],
    );

    expect(rows).not.toHaveLength(0);
  });

  it('rechaza estados fuera del dominio mediante CHECK', async () => {
    const insertInvalidUser = database.pool.query(
      `INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, ?)`,
      ['Usuario Sintético', 'sintetico@example.test', 'hash-sintetico', 'DESCONOCIDO'],
    );

    await expect(insertInvalidUser).rejects.toThrow(/chk_users_status/i);
  });

  it('usa UTC como zona horaria de la sesión', async () => {
    const [rows] = await database.pool.query<RowDataPacket[]>(
      'SELECT @@session.time_zone AS timeZone',
    );

    expect(rows[0]?.timeZone).toBe('+00:00');
  });
});
