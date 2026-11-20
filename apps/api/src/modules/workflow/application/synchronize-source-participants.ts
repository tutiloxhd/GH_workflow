import { succeed } from '../../../platform/result.js';
import { currentHolder } from '../domain/participants.js';
import { ASSIGN_PARTICIPANTS_TASK_CODE, hasRequiredParticipants } from '../domain/task-rules.js';
import { isTaskClosed } from '../domain/statuses.js';
import { endCurrentParticipants, insertParticipant } from '../persistence/workflow-repository.js';
import { runWorkflowCommand } from './run-workflow-command.js';
import type { WorkflowDependencies } from './workflow-dependencies.js';

export interface SourceParticipantAssignment {
  readonly participantType: 'MANAGER' | 'BIDDER';
  readonly userId: number;
}

export async function synchronizeSourceParticipants(
  dependencies: WorkflowDependencies,
  workflowId: number,
  assignments: readonly SourceParticipantAssignment[],
): Promise<void> {
  const outcome = await runWorkflowCommand(
    dependencies,
    workflowId,
    null,
    async (context) => {
      if (context.workflow.status !== 'ACTIVE' && context.workflow.status !== 'SUSPENDED') {
        return succeed(undefined);
      }

      const assignmentTask = context.tasks.find(
        (task) => task.code === ASSIGN_PARTICIPANTS_TASK_CODE,
      );
      const changedAssignments = assignments.filter(
        (assignment) =>
          currentHolder(context.participants, assignment.participantType, 'PRIMARY') !==
          assignment.userId,
      );
      const participantChanges = changedAssignments.map((assignment) => ({
        participantType: assignment.participantType,
        previousUserId: currentHolder(context.participants, assignment.participantType, 'PRIMARY'),
        newUserId: assignment.userId,
      }));
      for (const change of participantChanges) {
        if (change.previousUserId !== null) {
          await endCurrentParticipants(
            context.executor,
            workflowId,
            change.participantType,
            context.now,
          );
        }
        await insertParticipant(context.executor, {
          workflowId,
          userId: change.newUserId,
          participantType: change.participantType,
          assignmentType: 'PRIMARY',
          validFrom: context.now,
          assignedBy: null,
        });
      }
      if (participantChanges.length > 0) {
        await context.reloadParticipants();
        context.record({
          eventType: 'PARTICIPANTS_ASSIGNED',
          details: {
            assignments: participantChanges.map((change) => ({
              participantType: change.participantType,
              previousUserId: change.previousUserId,
              newUserId: change.newUserId,
            })),
          },
        });

        for (const change of participantChanges) {
          const openTasks = context.tasks.filter(
            (task) =>
              task.responsibleRole === change.participantType &&
              !isTaskClosed(task.status) &&
              task.status !== 'BLOCKED',
          );
          for (const task of openTasks) {
            await context.changeTask(task.id, {
              assignedUserId: change.newUserId,
            });
            context.record({
              taskId: task.id,
              eventType: 'TASK_ASSIGNED',
              details: {
                code: task.code,
                previousUserId: task.assignedUserId,
                newUserId: change.newUserId,
              },
            });
          }
        }
      }

      if (assignmentTask?.status !== 'READY') return succeed(undefined);
      const sourceAssignmentsMatchWorkflow =
        assignments.some((assignment) => assignment.participantType === 'MANAGER') &&
        assignments.some((assignment) => assignment.participantType === 'BIDDER') &&
        assignments.every(
          (assignment) =>
            currentHolder(context.participants, assignment.participantType, 'PRIMARY') ===
            assignment.userId,
        );
      if (sourceAssignmentsMatchWorkflow && hasRequiredParticipants(context.participants)) {
        await context.changeTask(assignmentTask.id, {
          status: 'COMPLETED',
          startedAt: context.now,
          completedAt: context.now,
          completedBy: null,
        });
        context.record({
          taskId: assignmentTask.id,
          eventType: 'TASK_COMPLETED',
          details: { code: assignmentTask.code, source: 'ADMIN_NEW' },
        });
        await context.activateReadyTasks();
        await context.completeWorkflowIfFinished();
      }
      return succeed(undefined);
    },
    'SYNC',
  );
  if (!outcome.isSuccess) {
    throw new Error(`No se pudieron sincronizar los participantes: ${outcome.failure}`);
  }
}
