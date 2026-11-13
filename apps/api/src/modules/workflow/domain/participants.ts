import type { RoleCode } from '../../identity/domain/role-code.js';

// Roles que se asignan por workflow; las tareas de ADMIN no tienen participante propio.
export const PARTICIPANT_TYPES = ['MANAGER', 'BIDDER', 'LEGAL_REVIEWER'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const ASSIGNMENT_TYPES = ['PRIMARY', 'BACKUP'] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const participantTypeForRole = (role: RoleCode): ParticipantType | undefined =>
  PARTICIPANT_TYPES.find((type) => type === role);

export interface CurrentParticipant {
  readonly participantType: ParticipantType;
  readonly assignmentType: AssignmentType;
  readonly userId: number;
}

export function currentHolder(
  participants: readonly CurrentParticipant[],
  participantType: ParticipantType,
  assignmentType: AssignmentType,
): number | null {
  return (
    participants.find(
      (participant) =>
        participant.participantType === participantType &&
        participant.assignmentType === assignmentType,
    )?.userId ?? null
  );
}
