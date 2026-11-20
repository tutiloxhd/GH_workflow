import { fail, succeed, type Result } from '../../../platform/result.js';
import type { AdminNewSource } from '../../admin-new-sync/persistence/admin-new-source.js';
import { findUserAccountById } from '../../identity/persistence/users-repository.js';
import type { DeadlineRule } from '../domain/due-date.js';
import { computeDeadline } from '../domain/due-date.js';
import { currentHolder, type ParticipantType } from '../domain/participants.js';
import { isTaskClosed, isTaskWorkable, isWorkflowClosed } from '../domain/statuses.js';
import { canChangeWorkflowLifecycle, isAdmin, type Actor } from '../domain/task-rules.js';
import {
  endCurrentParticipants,
  insertAppliedReprogramming,
  insertParticipant,
  updatePropertyAuctionAt,
} from '../persistence/workflow-repository.js';
import { runTaskCommand, runWorkflowCommand } from './run-workflow-command.js';
import type { WorkflowContext } from './workflow-context.js';
import type { WorkflowDependencies, WorkflowFailure } from './workflow-dependencies.js';

export interface WorkflowCommandResult {
  readonly workflowId: number;
}

const done = (context: WorkflowContext): Result<WorkflowCommandResult, never> =>
  succeed({ workflowId: context.workflow.id });

// ───────────── Participantes ─────────────

export interface ParticipantAssignment {
  readonly participantType: ParticipantType;
  readonly primaryUserId: number;
  readonly backupUserId: number | null;
}

async function isEligibleParticipant(
  context: WorkflowContext,
  userId: number,
  participantType: ParticipantType,
  agentTypesBySourceId: ReadonlyMap<number, readonly string[]>,
  enforceAgentType: boolean,
): Promise<boolean> {
  const user = await findUserAccountById(context.executor, userId);
  if (user?.status !== 'ACTIVE' || !user.roles.includes(participantType)) return false;
  if (participantType === 'LEGAL_REVIEWER') return true;
  if (!enforceAgentType) return true;
  if (user.adminNewUserId === null) return false;
  const agentTypes = agentTypesBySourceId.get(user.adminNewUserId) ?? [];
  if (participantType === 'MANAGER') return agentTypes.includes('region');
  return agentTypes.includes('oficina');
}

export async function assignParticipants(
  dependencies: WorkflowDependencies,
  source: Pick<AdminNewSource, 'readActiveAgentTypes'>,
  actor: Actor,
  workflowId: number,
  assignments: readonly ParticipantAssignment[],
): Promise<Result<WorkflowCommandResult, WorkflowFailure>> {
  const sourceAssignments = await source.readActiveAgentTypes();
  const agentTypesBySourceId = new Map(
    sourceAssignments.map((sourceAssignment) => [
      sourceAssignment.adminNewUserId,
      sourceAssignment.agentTypes,
    ]),
  );
  return runWorkflowCommand(dependencies, workflowId, actor.id, async (context) => {
    if (!isAdmin(actor)) return fail('FORBIDDEN');
    if (isWorkflowClosed(context.workflow.status)) return fail('WORKFLOW_CLOSED');

    for (const assignment of assignments) {
      const userIds = [assignment.primaryUserId, assignment.backupUserId].filter(
        (userId): userId is number => userId !== null,
      );
      if (assignment.primaryUserId === assignment.backupUserId) return fail('INVALID_PARTICIPANT');
      for (const userId of userIds) {
        const isCurrentAssignment =
          userId === currentHolder(context.participants, assignment.participantType, 'PRIMARY') ||
          userId === currentHolder(context.participants, assignment.participantType, 'BACKUP');
        if (
          !(await isEligibleParticipant(
            context,
            userId,
            assignment.participantType,
            agentTypesBySourceId,
            !isCurrentAssignment,
          ))
        ) {
          return fail('INVALID_PARTICIPANT');
        }
      }
    }

    for (const assignment of assignments) {
      await endCurrentParticipants(
        context.executor,
        workflowId,
        assignment.participantType,
        context.now,
      );
      await insertParticipant(context.executor, {
        workflowId,
        userId: assignment.primaryUserId,
        participantType: assignment.participantType,
        assignmentType: 'PRIMARY',
        validFrom: context.now,
        assignedBy: actor.id,
      });
      if (assignment.backupUserId !== null) {
        await insertParticipant(context.executor, {
          workflowId,
          userId: assignment.backupUserId,
          participantType: assignment.participantType,
          assignmentType: 'BACKUP',
          validFrom: context.now,
          assignedBy: actor.id,
        });
      }

      // Las tareas abiertas del rol pasan a los nuevos participantes; las bloqueadas los
      // recibirán al activarse.
      const openTasks = context.tasks.filter(
        (task) =>
          task.responsibleRole === assignment.participantType &&
          !isTaskClosed(task.status) &&
          task.status !== 'BLOCKED',
      );
      for (const task of openTasks) {
        await context.changeTask(task.id, {
          assignedUserId: assignment.primaryUserId,
          backupUserId: assignment.backupUserId,
        });
        context.record({
          taskId: task.id,
          eventType: 'TASK_ASSIGNED',
          details: {
            code: task.code,
            assignedUserId: assignment.primaryUserId,
            backupUserId: assignment.backupUserId,
          },
        });
      }
    }
    await context.reloadParticipants();
    context.record({ eventType: 'PARTICIPANTS_ASSIGNED', details: { assignments } });
    return done(context);
  });
}

// ───────────── Plazo editable por workflow ─────────────

export function changeTaskDeadline(
  dependencies: WorkflowDependencies,
  actor: Actor,
  taskId: number,
  rule: DeadlineRule,
): Promise<Result<WorkflowCommandResult, WorkflowFailure>> {
  return runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    if (!isAdmin(actor)) return fail('FORBIDDEN');
    const task = context.findTask(taskId);
    if (!task) return fail('TASK_NOT_FOUND');
    if (isWorkflowClosed(context.workflow.status)) return fail('WORKFLOW_CLOSED');
    if (isTaskClosed(task.status)) return fail('TASK_NOT_OPEN');

    // Solo cambia la copia del plazo de este workflow; la plantilla publicada no se toca.
    // Un plazo desde la activación sigue midiéndose desde donde corría (activación o reprogramación).
    const clockStart = task.dueReferenceAt ?? task.activatedAt ?? context.now;
    const deadline = isTaskWorkable(task.status)
      ? computeDeadline(rule, clockStart, context.businessDates)
      : {};
    await context.changeTask(taskId, { ...rule, ...deadline });
    context.record({
      taskId,
      eventType: 'TASK_DEADLINE_CHANGED',
      details: {
        code: task.code,
        previousRule: {
          dueReference: task.dueReference,
          dueOffsetDays: task.dueOffsetDays,
          dueOffsetMinutes: task.dueOffsetMinutes,
        },
        newRule: rule,
      },
    });
    return done(context);
  });
}

// ───────────── Suspender, reanudar y cancelar ─────────────

async function reprogram(
  context: WorkflowContext,
  actor: Actor,
  change: { newAuctionAt: Date; reason: string | null; trigger: 'SUSPENSION' | 'RESUME' },
): Promise<void> {
  const previousAuctionAt = context.businessDates.auctionAt;
  await updatePropertyAuctionAt(context.executor, context.workflow.propertyId, change.newAuctionAt);
  await insertAppliedReprogramming(context.executor, {
    workflowId: context.workflow.id,
    previousAuctionAt,
    newAuctionAt: change.newAuctionAt,
    reason: change.reason,
    requestedBy: actor.id,
    appliedAt: context.now,
  });
  context.setAuctionAt(change.newAuctionAt);
  await context.recalculateOpenDeadlines(context.now);
  context.record({
    eventType: 'WORKFLOW_REPROGRAMMED',
    details: {
      trigger: change.trigger,
      reason: change.reason,
      previousAuctionAt: previousAuctionAt?.toISOString() ?? null,
      newAuctionAt: change.newAuctionAt.toISOString(),
    },
  });
}

export interface SuspensionRequest {
  readonly reason: string;
  // Con nueva fecha el workflow sigue activo y se reprograma; sin ella queda suspendido.
  readonly newAuctionAt?: Date | undefined;
}

export function suspendWorkflow(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
  request: SuspensionRequest,
): Promise<Result<WorkflowCommandResult, WorkflowFailure>> {
  return runWorkflowCommand(dependencies, workflowId, actor.id, async (context) => {
    if (!canChangeWorkflowLifecycle(actor)) return fail('FORBIDDEN');
    if (context.workflow.status !== 'ACTIVE') return fail('WORKFLOW_NOT_ACTIVE');

    if (request.newAuctionAt) {
      await reprogram(context, actor, {
        newAuctionAt: request.newAuctionAt,
        reason: request.reason,
        trigger: 'SUSPENSION',
      });
      return done(context);
    }

    await context.changeWorkflow({ status: 'SUSPENDED', suspendedAt: context.now });
    for (const task of context.tasks) {
      if (!isTaskWorkable(task.status)) continue;
      await context.changeTask(task.id, {
        status: 'SUSPENDED',
        statusBeforeSuspension: task.status,
      });
      context.record({
        taskId: task.id,
        eventType: 'TASK_SUSPENDED',
        details: { code: task.code },
      });
    }
    context.record({ eventType: 'WORKFLOW_SUSPENDED', details: { reason: request.reason } });
    return done(context);
  });
}

export interface ResumeRequest {
  readonly newAuctionAt?: Date | undefined;
  readonly reason?: string | undefined;
}

export function resumeWorkflow(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
  request: ResumeRequest,
): Promise<Result<WorkflowCommandResult, WorkflowFailure>> {
  return runWorkflowCommand(dependencies, workflowId, actor.id, async (context) => {
    if (!canChangeWorkflowLifecycle(actor)) return fail('FORBIDDEN');
    if (context.workflow.status !== 'SUSPENDED') return fail('WORKFLOW_NOT_SUSPENDED');
    // Regla aprobada: un workflow suspendido sin fecha solo se reanuda con la nueva fecha.
    if (!request.newAuctionAt) return fail('NEW_AUCTION_DATE_REQUIRED');

    await context.changeWorkflow({ status: 'ACTIVE', suspendedAt: null });
    for (const task of context.tasks) {
      if (task.status !== 'SUSPENDED' || !task.statusBeforeSuspension) continue;
      await context.changeTask(task.id, {
        status: task.statusBeforeSuspension,
        statusBeforeSuspension: null,
      });
      context.record({ taskId: task.id, eventType: 'TASK_RESUMED', details: { code: task.code } });
    }
    context.record({ eventType: 'WORKFLOW_RESUMED', details: { reason: request.reason ?? null } });
    await reprogram(context, actor, {
      newAuctionAt: request.newAuctionAt,
      reason: request.reason ?? null,
      trigger: 'RESUME',
    });
    return done(context);
  });
}

export function cancelWorkflow(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
  reason: string,
): Promise<Result<WorkflowCommandResult, WorkflowFailure>> {
  return runWorkflowCommand(dependencies, workflowId, actor.id, async (context) => {
    if (!canChangeWorkflowLifecycle(actor)) return fail('FORBIDDEN');
    if (isWorkflowClosed(context.workflow.status)) return fail('WORKFLOW_CLOSED');

    await context.changeWorkflow({ status: 'CANCELLED', cancelledAt: context.now });
    for (const task of context.tasks) {
      if (isTaskClosed(task.status)) continue;
      await context.changeTask(task.id, { status: 'CANCELLED', statusBeforeSuspension: null });
      context.record({
        taskId: task.id,
        eventType: 'TASK_CANCELLED',
        details: { code: task.code },
      });
    }
    context.record({ eventType: 'WORKFLOW_CANCELLED', details: { reason } });
    return done(context);
  });
}
