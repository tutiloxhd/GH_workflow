import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import { normalizeEmail } from '../domain/email.js';
import {
  findPasswordPolicyViolations,
  type PasswordPolicyViolation,
} from '../domain/password-policy.js';
import { ADMIN_ROLE, type RoleCode } from '../domain/role-code.js';
import { findRoleIdsByCode, replaceUserRoleIds } from '../persistence/roles-repository.js';
import { revokeAllSessionsOfUser } from '../persistence/sessions-repository.js';
import {
  emailExists,
  findUserAccountById,
  insertUser,
  listUserAccounts,
  lockOtherActiveAdminIds,
  lockUserStatus,
  updateUserStatus,
  updateUserProfile,
  type UserAccount,
  type UserListQuery,
} from '../persistence/users-repository.js';
import type { IdentityDependencies } from './identity-dependencies.js';

export type CreateUserFailure =
  | { readonly code: 'EMAIL_ALREADY_REGISTERED' }
  | {
      readonly code: 'PASSWORD_POLICY_VIOLATION';
      readonly violations: readonly PasswordPolicyViolation[];
    };

export type UserChangeFailure =
  | { readonly code: 'USER_NOT_FOUND' }
  | { readonly code: 'CANNOT_CHANGE_OWN_ADMIN_ACCESS' }
  | { readonly code: 'LAST_ADMIN_REQUIRED' };

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly roles: readonly RoleCode[];
}

export async function updateOwnProfile(
  dependencies: IdentityDependencies,
  userId: number,
  profile: { readonly name: string; readonly email: string },
): Promise<Result<UserAccount, { readonly code: 'EMAIL_ALREADY_REGISTERED' | 'USER_NOT_FOUND' }>> {
  const normalizedProfile = { name: profile.name.trim(), email: normalizeEmail(profile.email) };
  try {
    const outcome = await dependencies.database.db.transaction(async (transaction) => {
      const status = await lockUserStatus(transaction, userId);
      if (!status) return fail({ code: 'USER_NOT_FOUND' as const });
      const current = await findUserAccountById(transaction, userId);
      if (!current) return fail({ code: 'USER_NOT_FOUND' as const });
      if (current.email !== normalizedProfile.email && await emailExists(transaction, normalizedProfile.email)) {
        return fail({ code: 'EMAIL_ALREADY_REGISTERED' as const });
      }
      await updateUserProfile(transaction, userId, normalizedProfile);
      const updated = await findUserAccountById(transaction, userId);
      if (!updated) throw new Error('El usuario bloqueado no se encontró');
      return succeed(updated);
    });
    if (outcome.isSuccess) dependencies.recordAudit('identity.profile_updated', { actorUserId: userId, targetUserId: userId });
    return outcome;
  } catch (error) {
    if (isDuplicateEntryError(error)) return fail({ code: 'EMAIL_ALREADY_REGISTERED' });
    throw error;
  }
}

async function requireRoleIds(
  executor: DatabaseExecutor,
  roleCodes: readonly RoleCode[],
): Promise<number[]> {
  const roleIdsByCode = await findRoleIdsByCode(executor, roleCodes);
  return roleCodes.map((code) => {
    const roleId = roleIdsByCode.get(code);
    // El catálogo de roles lo crea el seed; si falta, la instalación está incompleta.
    if (roleId === undefined) throw new Error(`El rol ${code} no existe en la base`);
    return roleId;
  });
}

// actorUserId es null solo cuando la cuenta se crea por consola (primer administrador).
export async function createUser(
  dependencies: IdentityDependencies,
  actorUserId: number | null,
  newUser: NewUser,
): Promise<Result<UserAccount, CreateUserFailure>> {
  const violations = findPasswordPolicyViolations(newUser.password);
  if (violations.length > 0) return fail({ code: 'PASSWORD_POLICY_VIOLATION', violations });

  const { db } = dependencies.database;
  const email = normalizeEmail(newUser.email);
  if (await emailExists(db, email)) return fail({ code: 'EMAIL_ALREADY_REGISTERED' });

  const passwordHash = await dependencies.passwordHasher.hash(newUser.password);
  const uniqueRoles = [...new Set(newUser.roles)];

  try {
    const account = await db.transaction(async (transaction) => {
      const userId = await insertUser(transaction, {
        name: newUser.name.trim(),
        email,
        passwordHash,
      });
      await replaceUserRoleIds(transaction, {
        userId,
        roleIds: await requireRoleIds(transaction, uniqueRoles),
        assignedBy: actorUserId,
        assignedAt: dependencies.clock.now(),
      });
      return findUserAccountById(transaction, userId);
    });
    if (!account) throw new Error('El usuario recién creado no se encontró');

    dependencies.recordAudit('identity.user_created', { actorUserId, targetUserId: account.id });
    return succeed(account);
  } catch (error) {
    // Otro administrador pudo registrar el mismo email entre la verificación y la inserción.
    if (isDuplicateEntryError(error)) return fail({ code: 'EMAIL_ALREADY_REGISTERED' });
    throw error;
  }
}

export async function replaceUserRoles(
  dependencies: IdentityDependencies,
  actorUserId: number,
  targetUserId: number,
  requestedRoles: readonly RoleCode[],
): Promise<Result<UserAccount, UserChangeFailure>> {
  const newRoles = [...new Set(requestedRoles)];

  const outcome = await dependencies.database.db.transaction(
    async (transaction): Promise<Result<UserAccount, UserChangeFailure>> => {
      const status = await lockUserStatus(transaction, targetUserId);
      if (!status) return fail({ code: 'USER_NOT_FOUND' });

      const losesAdmin = !newRoles.includes(ADMIN_ROLE);
      if (losesAdmin && targetUserId === actorUserId) {
        return fail({ code: 'CANNOT_CHANGE_OWN_ADMIN_ACCESS' });
      }
      if (losesAdmin) {
        const otherAdmins = await lockOtherActiveAdminIds(transaction, targetUserId);
        if (otherAdmins.length === 0) return fail({ code: 'LAST_ADMIN_REQUIRED' });
      }

      await replaceUserRoleIds(transaction, {
        userId: targetUserId,
        roleIds: await requireRoleIds(transaction, newRoles),
        assignedBy: actorUserId,
        assignedAt: dependencies.clock.now(),
      });
      const account = await findUserAccountById(transaction, targetUserId);
      if (!account) throw new Error('El usuario bloqueado no se encontró');
      return succeed(account);
    },
  );

  if (outcome.isSuccess) {
    dependencies.recordAudit('identity.roles_replaced', { actorUserId, targetUserId });
  }
  return outcome;
}

export async function deactivateUser(
  dependencies: IdentityDependencies,
  actorUserId: number,
  targetUserId: number,
): Promise<Result<UserAccount, UserChangeFailure>> {
  if (targetUserId === actorUserId) return fail({ code: 'CANNOT_CHANGE_OWN_ADMIN_ACCESS' });

  const outcome = await dependencies.database.db.transaction(
    async (transaction): Promise<Result<UserAccount, UserChangeFailure>> => {
      const status = await lockUserStatus(transaction, targetUserId);
      if (!status) return fail({ code: 'USER_NOT_FOUND' });

      const target = await findUserAccountById(transaction, targetUserId);
      if (target?.roles.includes(ADMIN_ROLE)) {
        const otherAdmins = await lockOtherActiveAdminIds(transaction, targetUserId);
        if (otherAdmins.length === 0) return fail({ code: 'LAST_ADMIN_REQUIRED' });
      }

      await updateUserStatus(transaction, targetUserId, 'INACTIVE');
      // Una cuenta desactivada pierde de inmediato las sesiones abiertas.
      await revokeAllSessionsOfUser(transaction, targetUserId, dependencies.clock.now());
      const account = await findUserAccountById(transaction, targetUserId);
      if (!account) throw new Error('El usuario bloqueado no se encontró');
      return succeed(account);
    },
  );

  if (outcome.isSuccess) {
    dependencies.recordAudit('identity.user_deactivated', { actorUserId, targetUserId });
  }
  return outcome;
}

export async function activateUser(
  dependencies: IdentityDependencies,
  actorUserId: number,
  targetUserId: number,
): Promise<Result<UserAccount, UserChangeFailure>> {
  const outcome = await dependencies.database.db.transaction(
    async (transaction): Promise<Result<UserAccount, UserChangeFailure>> => {
      const status = await lockUserStatus(transaction, targetUserId);
      if (!status) return fail({ code: 'USER_NOT_FOUND' });

      await updateUserStatus(transaction, targetUserId, 'ACTIVE');
      const account = await findUserAccountById(transaction, targetUserId);
      if (!account) throw new Error('El usuario bloqueado no se encontró');
      return succeed(account);
    },
  );

  if (outcome.isSuccess) {
    dependencies.recordAudit('identity.user_activated', { actorUserId, targetUserId });
  }
  return outcome;
}

export function listUsers(
  dependencies: IdentityDependencies,
  query: UserListQuery,
): Promise<{ users: UserAccount[]; total: number }> {
  return listUserAccounts(dependencies.database.db, query);
}
