import { fail, type Result } from '../../../platform/result.js';
import { findWorkflowIdOfTask } from '../persistence/workflow-repository.js';
import { WorkflowContext } from './workflow-context.js';
import type { WorkflowDependencies, WorkflowFailure } from './workflow-dependencies.js';

// Ejecuta un comando en una transacción con la instancia bloqueada y guarda su historial.
// Si el comando falla, no se confirma ningún cambio.
export async function runWorkflowCommand<Value>(
  dependencies: WorkflowDependencies,
  workflowId: number,
  actorUserId: number | null,
  command: (context: WorkflowContext) => Promise<Result<Value, WorkflowFailure>>,
): Promise<Result<Value, WorkflowFailure>> {
  const now = dependencies.clock.now();
  try {
    return await dependencies.database.db.transaction(async (transaction) => {
      const context = await WorkflowContext.load(transaction, workflowId, now, actorUserId);
      if (!context) return fail('WORKFLOW_NOT_FOUND' as const);

      const outcome = await command(context);
      if (!outcome.isSuccess) throw new RejectedCommand(outcome.failure);
      await context.flushEvents();
      return outcome;
    });
  } catch (error) {
    // El rechazo se lanza solo para revertir la transacción; hacia afuera es un resultado.
    if (error instanceof RejectedCommand) return fail(error.failure);
    throw error;
  }
}

class RejectedCommand extends Error {
  constructor(readonly failure: WorkflowFailure) {
    super(failure);
  }
}

export async function runTaskCommand<Value>(
  dependencies: WorkflowDependencies,
  taskId: number,
  actorUserId: number,
  command: (context: WorkflowContext) => Promise<Result<Value, WorkflowFailure>>,
): Promise<Result<Value, WorkflowFailure>> {
  const workflowId = await findWorkflowIdOfTask(dependencies.database.db, taskId);
  if (workflowId === null) return fail('TASK_NOT_FOUND');
  return runWorkflowCommand(dependencies, workflowId, actorUserId, command);
}
