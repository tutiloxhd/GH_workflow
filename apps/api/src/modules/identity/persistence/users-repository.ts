import { and, asc, count, eq, inArray, like, ne, or, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { roles, userRoles, users } from '../../../platform/database/schema/identity.schema.js';
import { normalizeEmail } from '../domain/email.js';
import { ADMIN_ROLE, type RoleCode } from '../domain/role-code.js';
import type { UserStatus } from '../domain/user-status.js';

export interface UserAccount {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly rut: string | null;
  readonly adminNewUserId: number | null;
  readonly adminNewAreaId: number | null;
  readonly adminNewAreaName: string | null;
  readonly adminNewRegion: string | null;
  readonly status: UserStatus;
  readonly roles: readonly RoleCode[];
  readonly createdAt: Date;
}

export interface UserCredentials {
  readonly id: number;
  readonly status: UserStatus;
  readonly passwordHash: string;
}

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  rut: users.rut,
  adminNewUserId: users.adminNewUserId,
  adminNewAreaId: users.adminNewAreaId,
  adminNewAreaName: users.adminNewAreaName,
  adminNewRegion: users.adminNewRegion,
  status: users.status,
  createdAt: users.createdAt,
};

type UserRow = Omit<UserAccount, 'roles'>;

async function attachRoles(
  executor: DatabaseExecutor,
  userRows: readonly UserRow[],
): Promise<UserAccount[]> {
  if (userRows.length === 0) return [];

  const roleRows = await executor
    .select({ userId: userRoles.userId, code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      inArray(
        userRoles.userId,
        userRows.map((user) => user.id),
      ),
    )
    .orderBy(asc(roles.code));

  return userRows.map((user) => ({
    ...user,
    roles: roleRows.filter((role) => role.userId === user.id).map((role) => role.code),
  }));
}

export async function findUserCredentialsByEmail(
  executor: DatabaseExecutor,
  normalizedEmail: string,
): Promise<UserCredentials | undefined> {
  const [user] = await executor
    .select({ id: users.id, status: users.status, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  return user;
}

export async function findUserAccountById(
  executor: DatabaseExecutor,
  userId: number,
): Promise<UserAccount | undefined> {
  const userRows = await executor.select(userColumns).from(users).where(eq(users.id, userId));
  const [account] = await attachRoles(executor, userRows);
  return account;
}

export async function findActiveUsersByAdminNewUserIds(
  executor: DatabaseExecutor,
  adminNewUserIds: readonly number[],
): Promise<UserAccount[]> {
  const uniqueIds = [...new Set(adminNewUserIds)];
  if (uniqueIds.length === 0) return [];
  const userRows = await executor
    .select(userColumns)
    .from(users)
    .where(and(inArray(users.adminNewUserId, uniqueIds), eq(users.status, 'ACTIVE')))
    .orderBy(asc(users.name), asc(users.id));
  return attachRoles(executor, userRows);
}

// Bloquea la fila del usuario hasta el fin de la transacción.
export async function lockUserStatus(
  executor: DatabaseExecutor,
  userId: number,
): Promise<UserStatus | undefined> {
  const [user] = await executor
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  return user?.status;
}

export async function emailExists(
  executor: DatabaseExecutor,
  normalizedEmail: string,
): Promise<boolean> {
  const [match] = await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  return match !== undefined;
}

export async function findUserIdsByAdminNewUserIds(
  executor: DatabaseExecutor,
  adminNewUserIds: readonly number[],
): Promise<Map<number, number>> {
  if (adminNewUserIds.length === 0) return new Map();
  const rows = await executor
    .select({ id: users.id, adminNewUserId: users.adminNewUserId })
    .from(users)
    .where(inArray(users.adminNewUserId, adminNewUserIds));
  return new Map(
    rows.flatMap((row) =>
      row.adminNewUserId === null ? [] : [[row.adminNewUserId, row.id] as const],
    ),
  );
}

export async function findAdminNewUserRegions(
  executor: DatabaseExecutor,
  adminNewUserIds: readonly number[],
): Promise<Map<number, { userId: number; region: string | null }>> {
  if (adminNewUserIds.length === 0) return new Map();
  const rows = await executor
    .select({
      userId: users.id,
      adminNewUserId: users.adminNewUserId,
      region: users.adminNewRegion,
    })
    .from(users)
    .where(inArray(users.adminNewUserId, adminNewUserIds));
  return new Map(
    rows.flatMap((row) =>
      row.adminNewUserId === null
        ? []
        : [[row.adminNewUserId, { userId: row.userId, region: row.region }] as const],
    ),
  );
}

export async function updateAdminNewUserRegion(
  executor: DatabaseExecutor,
  userId: number,
  region: string,
): Promise<void> {
  await executor.update(users).set({ adminNewRegion: region }).where(eq(users.id, userId));
}

export async function findExistingEmails(
  executor: DatabaseExecutor,
  emails: readonly string[],
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await executor
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.email, emails));
  return new Set(rows.map((row) => normalizeEmail(row.email)));
}

export async function insertUser(
  executor: DatabaseExecutor,
  user: {
    name: string;
    email: string;
    passwordHash: string;
    rut?: string | null;
    adminNewUserId?: number | null;
    adminNewAreaId?: number | null;
    adminNewAreaName?: string | null;
    adminNewRegion?: string | null;
  },
): Promise<number> {
  const [inserted] = await executor.insert(users).values(user).$returningId();
  if (!inserted) throw new Error('La inserción del usuario no devolvió identificador');
  return inserted.id;
}

export async function updateUserStatus(
  executor: DatabaseExecutor,
  userId: number,
  status: UserStatus,
): Promise<void> {
  await executor.update(users).set({ status }).where(eq(users.id, userId));
}

// Cuenta y bloquea a los demás administradores activos, para que dos cambios concurrentes
// no dejen el sistema sin ninguno.
export async function lockOtherActiveAdminIds(
  executor: DatabaseExecutor,
  excludedUserId: number,
): Promise<number[]> {
  const rows = await executor
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(eq(roles.code, ADMIN_ROLE), eq(users.status, 'ACTIVE'), ne(users.id, excludedUserId)),
    )
    .for('update');
  return rows.map((row) => row.id);
}

// Usuario activo de menor id con el rol: responsable por defecto cuando el workflow no tiene
// un participante asignado para ese rol.
export async function findFirstActiveUserIdWithRole(
  executor: DatabaseExecutor,
  role: RoleCode,
): Promise<number | null> {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.code, role), eq(users.status, 'ACTIVE')))
    .orderBy(asc(users.id))
    .limit(1);
  return row?.id ?? null;
}

// The database collation may consider case or accents equivalent; filter again in JavaScript
// so source synchronization only accepts a literal, unique display-name match.
export async function findActiveUserIdsByExactNameAndRole(
  executor: DatabaseExecutor,
  name: string,
  role: RoleCode,
): Promise<{ id: number; region: string | null }[]> {
  const rows = await executor
    .select({ id: users.id, name: users.name, region: users.adminNewRegion })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.code, role), eq(users.status, 'ACTIVE'), eq(users.name, name)));
  return rows.filter((user) => user.name === name).map(({ id, region }) => ({ id, region }));
}

export async function findUserNames(
  executor: DatabaseExecutor,
  userIds: readonly number[],
): Promise<Map<number, string>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await executor
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export interface UserListQuery {
  readonly search: string | undefined;
  readonly role: RoleCode | undefined;
  readonly limit: number;
  readonly offset: number;
}

const escapeLikePattern = (text: string): string =>
  text.replace(/[\\%_]/g, (match) => `\\${match}`);

export async function listUserAccounts(
  executor: DatabaseExecutor,
  query: UserListQuery,
): Promise<{ users: UserAccount[]; total: number }> {
  const conditions: SQL[] = [];
  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`;
    const searchCondition = or(like(users.name, pattern), like(users.email, pattern));
    if (searchCondition) conditions.push(searchCondition);
  }
  if (query.role) {
    conditions.push(
      inArray(
        users.id,
        executor
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(eq(roles.code, query.role)),
      ),
    );
  }
  const filter = and(...conditions);

  const userRows = await executor
    .select(userColumns)
    .from(users)
    .where(filter)
    .orderBy(asc(users.name), asc(users.id))
    .limit(query.limit)
    .offset(query.offset);
  const [totalRow] = await executor.select({ total: count() }).from(users).where(filter);

  return { users: await attachRoles(executor, userRows), total: totalRow?.total ?? 0 };
}
