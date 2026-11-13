import type { RoleCode } from '../../identity/domain/role-code.js';
import { currentHolder, type CurrentParticipant } from './participants.js';

// «Asignar gestor y postor» solo se completa con ambos titulares asignados en el workflow.
export const ASSIGN_PARTICIPANTS_TASK_CODE = 'ASSIGN_MANAGER_AND_BIDDER';

export const hasRequiredParticipants = (participants: readonly CurrentParticipant[]): boolean =>
  currentHolder(participants, 'MANAGER', 'PRIMARY') !== null &&
  currentHolder(participants, 'BIDDER', 'PRIMARY') !== null;

export interface Actor {
  readonly id: number;
  readonly roles: readonly RoleCode[];
}

// El administrador puede actuar sobre cualquier tarea y workflow sin ser participante.
export const isAdmin = (actor: Actor): boolean => actor.roles.includes('ADMIN');

// Suspender, reanudar y cancelar son decisiones de administración o de revisión legal.
export const canChangeWorkflowLifecycle = (actor: Actor): boolean =>
  isAdmin(actor) || actor.roles.includes('LEGAL_REVIEWER');

export type TaskActorRelation = 'ADMIN' | 'ASSIGNEE' | 'BACKUP' | 'UNRELATED';

// Si el usuario es a la vez titular o suplente, prima esa relación: un suplente que también es
// admin igualmente reemplaza al titular cuando actúa.
export function relationToTask(
  actor: Actor,
  task: { readonly assignedUserId: number | null; readonly backupUserId: number | null },
): TaskActorRelation {
  if (task.assignedUserId === actor.id) return 'ASSIGNEE';
  if (task.backupUserId === actor.id) return 'BACKUP';
  if (isAdmin(actor)) return 'ADMIN';
  return 'UNRELATED';
}
