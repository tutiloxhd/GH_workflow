import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import {
  assignPublishedNotificationRuleSet,
  findActiveTemplateId,
  findPropertyDates,
  findWorkflowIdByProperty,
  insertTasksFromTemplate,
  insertWorkflow,
} from '../persistence/workflow-repository.js';
import { WorkflowContext } from './workflow-context.js';
import type { WorkflowDependencies, WorkflowFailure } from './workflow-dependencies.js';
import type { ParticipantType } from '../domain/participants.js';
import { ASSIGN_PARTICIPANTS_TASK_CODE, hasRequiredParticipants } from '../domain/task-rules.js';
import { insertParticipant } from '../persistence/workflow-repository.js';

export interface StartedWorkflow {
  readonly workflowId: number;
  readonly wasCreated: boolean;
}

export interface StartWorkflowOptions {
  readonly assignedParticipants: readonly {
    readonly participantType: ParticipantType;
    readonly userId: number;
  }[];
}

// Idempotente: una propiedad tiene a lo sumo un workflow (UNIQUE property_id). Repetir el inicio,
// incluso de forma concurrente, devuelve el existente sin crear otro.
export async function startWorkflow(
  dependencies: WorkflowDependencies,
  actorUserId: number | null,
  propertyId: number,
  options: StartWorkflowOptions = { assignedParticipants: [] },
): Promise<Result<StartedWorkflow, WorkflowFailure>> {
  const { db } = dependencies.database;
  if (!(await findPropertyDates(db, propertyId))) return fail('PROPERTY_NOT_FOUND');

  const existingId = await findWorkflowIdByProperty(db, propertyId);
  if (existingId !== null) return succeed({ workflowId: existingId, wasCreated: false });

  const templateId = await findActiveTemplateId(db);
  if (templateId === null) return fail('NO_ACTIVE_TEMPLATE');

  const now = dependencies.clock.now();
  try {
    const workflowId = await db.transaction(async (transaction) => {
      const createdId = await insertWorkflow(transaction, {
        propertyId,
        templateId,
        startedAt: now,
      });
      await insertTasksFromTemplate(transaction, createdId, templateId);
      for (const participant of options.assignedParticipants) {
        await insertParticipant(transaction, {
          workflowId: createdId,
          userId: participant.userId,
          participantType: participant.participantType,
          assignmentType: 'PRIMARY',
          validFrom: now,
          assignedBy: null,
        });
      }
      await assignPublishedNotificationRuleSet(transaction, createdId, templateId);

      const context = await WorkflowContext.load(transaction, createdId, now, actorUserId);
      if (!context) throw new Error('El workflow recién creado no se encontró');
      context.record({ eventType: 'WORKFLOW_CREATED', details: { propertyId, templateId } });
      if (options.assignedParticipants.length > 0) {
        context.record({
          eventType: 'PARTICIPANTS_ASSIGNED',
          details: {
            source: 'ADMIN_NEW',
            assignments: options.assignedParticipants.map((participant) => ({
              participantType: participant.participantType,
              primaryUserId: participant.userId,
            })),
          },
        });
      }
      for (const task of context.tasks) {
        context.record({
          taskId: task.id,
          eventType: 'TASK_CREATED',
          details: { code: task.code },
        });
      }
      await context.activateReadyTasks();
      const acceptanceTask = context.tasks.find((task) => task.code === 'ACCEPT_PROPERTY');
      if (acceptanceTask?.status === 'READY') {
        await context.changeTask(acceptanceTask.id, {
          status: 'COMPLETED',
          startedAt: now,
          completedAt: now,
          completedBy: null,
        });
        context.record({
          taskId: acceptanceTask.id,
          eventType: 'TASK_COMPLETED',
          details: { code: acceptanceTask.code, source: 'ADMIN_NEW' },
        });
        await context.activateReadyTasks();
      }
      if (hasRequiredParticipants(context.participants)) {
        const assignmentTask = context.tasks.find(
          (task) => task.code === ASSIGN_PARTICIPANTS_TASK_CODE,
        );
        if (assignmentTask?.status === 'READY') {
          await context.changeTask(assignmentTask.id, {
            status: 'COMPLETED',
            startedAt: now,
            completedAt: now,
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
      }
      await context.flushEvents();
      return createdId;
    });
    return succeed({ workflowId, wasCreated: true });
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
    const concurrentId = await findWorkflowIdByProperty(db, propertyId);
    if (concurrentId === null) throw error;
    return succeed({ workflowId: concurrentId, wasCreated: false });
  }
}
