import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  int,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { ROLE_CODES } from '../../../modules/identity/domain/role-code.js';
import { USER_STATUSES } from '../../../modules/identity/domain/user-status.js';
import { createdAt, primaryId, referenceId, updatedAt, utcDateTime } from './columns.js';

export const users = mysqlTable(
  'users',
  {
    id: primaryId(),
    name: varchar('name', { length: 150 }).notNull(),
    email: varchar('email', { length: 190 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    rut: varchar('rut', { length: 20 }),
    adminNewUserId: int('admin_new_user_id', { unsigned: true }),
    adminNewAreaId: int('admin_new_area_id', { unsigned: true }),
    adminNewAreaName: varchar('admin_new_area_name', { length: 50 }),
    adminNewRegion: varchar('admin_new_region', { length: 100 }),
    status: varchar('status', { length: 20, enum: USER_STATUSES }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_users_email').on(table.email),
    uniqueIndex('uq_users_admin_new_user_id').on(table.adminNewUserId),
    check('chk_users_status', sql`${table.status} IN ('ACTIVE', 'INACTIVE', 'BLOCKED')`),
  ],
);

export const userSessions = mysqlTable(
  'user_sessions',
  {
    id: primaryId(),
    userId: referenceId('user_id').notNull(),
    // SHA-256 en hexadecimal del token; el token real nunca se persiste.
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: utcDateTime('expires_at').notNull(),
    revokedAt: utcDateTime('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_user_sessions_token_hash').on(table.tokenHash),
    index('idx_user_sessions_user').on(table.userId, table.expiresAt),
    foreignKey({
      name: 'fk_user_sessions_user',
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
  ],
);

// Intentos de inicio de sesión por email normalizado; sostienen el bloqueo por fuerza bruta.
// Se registra también el email de cuentas inexistentes para no revelar cuáles existen.
export const loginAttempts = mysqlTable(
  'login_attempts',
  {
    id: primaryId(),
    email: varchar('email', { length: 190 }).notNull(),
    succeeded: boolean('succeeded').notNull(),
    attemptedAt: utcDateTime('attempted_at').notNull(),
  },
  (table) => [index('idx_login_attempts_email').on(table.email, table.attemptedAt)],
);

export const roles = mysqlTable(
  'roles',
  {
    id: primaryId(),
    code: varchar('code', { length: 50, enum: ROLE_CODES }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('uq_roles_code').on(table.code)],
);

export const userRoles = mysqlTable(
  'user_roles',
  {
    userId: referenceId('user_id').notNull(),
    roleId: referenceId('role_id').notNull(),
    assignedAt: createdAt('assigned_at'),
    assignedBy: referenceId('assigned_by'),
  },
  (table) => [
    primaryKey({ name: 'pk_user_roles', columns: [table.userId, table.roleId] }),
    index('idx_user_roles_role').on(table.roleId),
    foreignKey({ name: 'fk_user_roles_user', columns: [table.userId], foreignColumns: [users.id] }),
    foreignKey({ name: 'fk_user_roles_role', columns: [table.roleId], foreignColumns: [roles.id] }),
    foreignKey({
      name: 'fk_user_roles_assigned_by',
      columns: [table.assignedBy],
      foreignColumns: [users.id],
    }),
  ],
);
