import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import {
  findActiveTemplateId,
  findPropertyDates,
  findWorkflowIdByProperty,
  insertTasksFromTemplate,
  insertWorkflow,
} from '../persistence/workflow-repository.js';
import { WorkflowContext } from './workflow-context.js';
import type { WorkflowDependencies, WorkflowFailure } from './workflow-dependencies.js';

export interface StartedWorkflow {
  readonly workflowId: number;
  readonly wasCreated: boolean;
}

// Idempotente: una propiedad tiene a lo sumo un workflow (UNIQUE property_id). Repetir el inicio,
// incluso de forma concurrente, devuelve el existente sin crear otro.
export async function startWorkflow(
  dependencies: WorkflowDependencies,
  actorUserId: number | null,
  propertyId: number,
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

      const context = await WorkflowContext.load(transaction, createdId, now, actorUserId);
      if (!context) throw new Error('El workflow recién creado no se encontró');
      context.record({ eventType: 'WORKFLOW_CREATED', details: { propertyId, templateId } });
      for (const task of context.tasks) {
        context.record({
          taskId: task.id,
          eventType: 'TASK_CREATED',
          details: { code: task.code },
        });
      }
      await context.activateReadyTasks();
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
