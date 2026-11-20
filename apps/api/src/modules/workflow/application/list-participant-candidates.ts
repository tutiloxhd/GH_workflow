import type { Database } from '../../../platform/database/database.js';
import type { AdminNewSource } from '../../admin-new-sync/persistence/admin-new-source.js';
import type { RoleCode } from '../../identity/domain/role-code.js';
import { findActiveUsersByAdminNewUserIds } from '../../identity/persistence/users-repository.js';

export interface ParticipantCandidate {
  readonly id: number;
  readonly name: string;
  readonly rut: string | null;
  readonly roles: readonly RoleCode[];
  readonly agentTypes: readonly string[];
}

export async function listParticipantCandidates(
  database: Database,
  source: Pick<AdminNewSource, 'readActiveAgentTypes'>,
): Promise<ParticipantCandidate[]> {
  const sourceAssignments = await source.readActiveAgentTypes();
  const users = await findActiveUsersByAdminNewUserIds(
    database.db,
    sourceAssignments.map((assignment) => assignment.adminNewUserId),
  );
  const typesBySourceId = new Map(
    sourceAssignments.map((assignment) => [assignment.adminNewUserId, assignment.agentTypes]),
  );

  return users.flatMap((user) => {
    if (user.adminNewUserId === null) return [];
    const agentTypes = typesBySourceId.get(user.adminNewUserId);
    if (!agentTypes) return [];
    return [
      {
        id: user.id,
        name: user.name,
        rut: user.rut,
        roles: user.roles,
        agentTypes,
      },
    ];
  });
}
