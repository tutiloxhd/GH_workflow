import { eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { roles, userRoles } from '../../../platform/database/schema/identity.schema.js';
import type { RoleCode } from '../domain/role-code.js';

export async function findRoleIdsByCode(
  executor: DatabaseExecutor,
  roleCodes: readonly RoleCode[],
): Promise<Map<RoleCode, number>> {
  if (roleCodes.length === 0) return new Map();
  const rows = await executor
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(inArray(roles.code, [...roleCodes]));
  return new Map(rows.map((row) => [row.code, row.id]));
}

// Se borran y reinsertan las filas: user_roles solo guarda el conjunto vigente.
export async function replaceUserRoleIds(
  executor: DatabaseExecutor,
  assignment: {
    userId: number;
    roleIds: readonly number[];
    assignedBy: number | null;
    assignedAt: Date;
  },
): Promise<void> {
  await executor.delete(userRoles).where(eq(userRoles.userId, assignment.userId));
  if (assignment.roleIds.length === 0) return;

  await executor.insert(userRoles).values(
    assignment.roleIds.map((roleId) => ({
      userId: assignment.userId,
      roleId,
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
    })),
  );
}

export async function addMissingUserRoleIds(
  executor: DatabaseExecutor,
  assignment: {
    userId: number;
    roleIds: readonly number[];
    assignedBy: number | null;
    assignedAt: Date;
  },
): Promise<number> {
  if (assignment.roleIds.length === 0) return 0;

  const currentRows = await executor
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, assignment.userId));
  const currentRoleIds = new Set(currentRows.map((row) => row.roleId));
  const missingRoleIds = assignment.roleIds.filter((roleId) => !currentRoleIds.has(roleId));
  if (missingRoleIds.length === 0) return 0;

  await executor.insert(userRoles).values(
    missingRoleIds.map((roleId) => ({
      userId: assignment.userId,
      roleId,
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
    })),
  );
  return missingRoleIds.length;
}
