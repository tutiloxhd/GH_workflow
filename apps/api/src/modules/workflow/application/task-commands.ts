import { fail, succeed, type Result } from '../../../platform/result.js';
import { evidenceSchemaFor, resolveEvidenceForm } from '../domain/evidence-forms.js';
import { isValidEvidencePhoto, MAX_EVIDENCE_PHOTOS } from '../domain/evidence-photos.js';
import { participantTypeForRole } from '../domain/participants.js';
import { isTaskClosed, isTaskWorkable } from '../domain/statuses.js';
import {
  ASSIGN_PARTICIPANTS_TASK_CODE,
  hasRequiredParticipants,
  relationToTask,
  type Actor,
} from '../domain/task-rules.js';
import {
  endCurrentParticipants,
  findTaskEvidenceDefinition,
  hasEvidence,
  countEvidencePhotos,
  addEvidencePhoto,
  deleteEvidencePhoto,
  findEvidencePhoto,
  insertParticipant,
  upsertEvidence,
  type TaskRecord,
} from '../persistence/workflow-repository.js';
import { runTaskCommand } from './run-workflow-command.js';
import type { WorkflowContext } from './workflow-context.js';
import type { WorkflowDependencies, WorkflowFailure } from './workflow-dependencies.js';

export interface TaskCommandResult {
  readonly workflowId: number;
}

// Verifica que el actor pueda trabajar la tarea ahora. Si es el suplente, pasa a ser el titular
// del rol en todo el workflow (regla aprobada: el suplente reemplaza definitivamente al titular).
async function authorizeWork(
  context: WorkflowContext,
  actor: Actor,
  taskId: number,
): Promise<Result<TaskRecord, WorkflowFailure>> {
  const task = context.findTask(taskId);
  if (!task) return fail('TASK_NOT_FOUND');

  const relation = relationToTask(actor, task);
  if (relation === 'UNRELATED') return fail('FORBIDDEN');
  if (context.workflow.status !== 'ACTIVE') return fail('WORKFLOW_NOT_ACTIVE');
  if (!isTaskWorkable(task.status)) return fail('TASK_NOT_OPEN');

  if (relation === 'BACKUP') await promoteBackupToPrimary(context, actor.id, task);
  return succeed(context.findTask(taskId) ?? task);
}

async function promoteBackupToPrimary(
  context: WorkflowContext,
  backupUserId: number,
  task: TaskRecord,
): Promise<void> {
  const participantType = participantTypeForRole(task.responsibleRole);
  if (!participantType) return;

  const previousPrimary = task.assignedUserId;
  await endCurrentParticipants(context.executor, context.workflow.id, participantType, context.now);
  await insertParticipant(context.executor, {
    workflowId: context.workflow.id,
    userId: backupUserId,
    participantType,
    assignmentType: 'PRIMARY',
    validFrom: context.now,
    assignedBy: backupUserId,
  });
  await context.reloadParticipants();

  const openTasksOfRole = context.tasks.filter(
    (candidate) =>
      candidate.responsibleRole === task.responsibleRole && !isTaskClosed(candidate.status),
  );
  for (const roleTask of openTasksOfRole) {
    // Las bloqueadas reciben responsable al activarse, ya desde el nuevo titular.
    if (roleTask.status === 'BLOCKED') continue;
    await context.changeTask(roleTask.id, { assignedUserId: backupUserId, backupUserId: null });
  }
  context.record({
    taskId: task.id,
    eventType: 'PARTICIPANT_REPLACED_BY_BACKUP',
    details: { participantType, previousUserId: previousPrimary, newUserId: backupUserId },
  });
}

export function startTask(
  dependencies: WorkflowDependencies,
  actor: Actor,
  taskId: number,
): Promise<Result<TaskCommandResult, WorkflowFailure>> {
  return runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    const authorized = await authorizeWork(context, actor, taskId);
    if (!authorized.isSuccess) return authorized;

    if (authorized.value.status === 'READY') {
      await context.changeTask(taskId, { status: 'IN_PROGRESS', startedAt: context.now });
      context.record({
        taskId,
        eventType: 'TASK_STARTED',
        details: { code: authorized.value.code },
      });
    }
    return succeed({ workflowId: context.workflow.id });
  });
}

export type EvidenceFailure =
  | { readonly code: WorkflowFailure | 'EVIDENCE_NOT_APPLICABLE' }
  | { readonly code: 'INVALID_EVIDENCE'; readonly invalidFields: readonly string[] };

export async function uploadTaskEvidencePhoto(
  dependencies: WorkflowDependencies, actor: Actor, taskId: number, bytes: Buffer, mimeType: string,
): Promise<Result<TaskCommandResult, WorkflowFailure | 'INVALID_EVIDENCE_PHOTO'>> {
  if (!isValidEvidencePhoto(bytes, mimeType)) return fail('INVALID_EVIDENCE_PHOTO');
  const definition = await findTaskEvidenceDefinition(dependencies.database.db, taskId);
  if (!definition) return fail('TASK_NOT_FOUND');
  if (!resolveEvidenceForm(definition.code, definition.evidenceForm)?.requiresPhoto) {
    return fail('INVALID_EVIDENCE_PHOTO');
  }
  return runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    const authorized = await authorizeWork(context, actor, taskId);
    if (!authorized.isSuccess) return authorized;
    if (await countEvidencePhotos(context.executor, taskId) >= MAX_EVIDENCE_PHOTOS) {
      return fail('EVIDENCE_PHOTO_LIMIT');
    }
    await addEvidencePhoto(context.executor, { taskId, uploadedBy: actor.id, bytes, mimeType });
    context.record({ taskId, eventType: 'EVIDENCE_PHOTO_ADDED', details: { mimeType, sizeBytes: bytes.length } });
    return succeed({ workflowId: context.workflow.id });
  });
}

export async function removeTaskEvidencePhoto(
  dependencies: WorkflowDependencies, actor: Actor, taskId: number, photoId: number,
): Promise<Result<TaskCommandResult, WorkflowFailure>> {
  return runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    const authorized = await authorizeWork(context, actor, taskId);
    if (!authorized.isSuccess) return authorized;
    const photo = await findEvidencePhoto(context.executor, photoId);
    if (!photo || photo.taskId !== taskId) return fail('TASK_NOT_FOUND');
    await deleteEvidencePhoto(context.executor, photoId);
    context.record({ taskId, eventType: 'EVIDENCE_PHOTO_DELETED', details: { photoId } });
    return succeed({ workflowId: context.workflow.id });
  });
}

// Guarda o reemplaza el formulario de evidencia vigente de la tarea. El formulario se valida
// antes de abrir la transacción: depende solo de la definición de la tarea, que nunca cambia.
export async function submitTaskEvidence(
  dependencies: WorkflowDependencies,
  actor: Actor,
  taskId: number,
  formData: unknown,
): Promise<Result<TaskCommandResult, EvidenceFailure>> {
  const definition = await findTaskEvidenceDefinition(dependencies.database.db, taskId);
  if (definition === null) return fail({ code: 'TASK_NOT_FOUND' });
  const form = resolveEvidenceForm(definition.code, definition.evidenceForm);
  const schema = evidenceSchemaFor(definition.code, form);
  if (!schema) return fail({ code: 'EVIDENCE_NOT_APPLICABLE' });
  const parsed = schema.safeParse(formData);
  if (!parsed.success) {
    // Un campo que el formulario no tiene se informa por su nombre, no como error de la raíz.
    const invalidFields = [
      ...new Set(
        parsed.error.issues.flatMap((issue) =>
          issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.')],
        ),
      ),
    ];
    return fail({ code: 'INVALID_EVIDENCE', invalidFields });
  }

  const outcome = await runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    const authorized = await authorizeWork(context, actor, taskId);
    if (!authorized.isSuccess) return authorized;

    if (form?.requiresPhoto && await countEvidencePhotos(context.executor, taskId) === 0) {
      return fail('EVIDENCE_PHOTO_REQUIRED');
    }

    await upsertEvidence(context.executor, {
      taskId,
      submittedBy: actor.id,
      formData: parsed.data,
      submittedAt: context.now,
    });
    context.record({ taskId, eventType: 'EVIDENCE_SUBMITTED', details: { code: definition.code } });
    return succeed({ workflowId: context.workflow.id });
  });
  return outcome.isSuccess ? outcome : fail({ code: outcome.failure });
}

export function completeTask(
  dependencies: WorkflowDependencies,
  actor: Actor,
  taskId: number,
): Promise<Result<TaskCommandResult, WorkflowFailure>> {
  return runTaskCommand(dependencies, taskId, actor.id, async (context) => {
    const authorized = await authorizeWork(context, actor, taskId);
    if (!authorized.isSuccess) return authorized;
    const task = authorized.value;

    if (
      task.code === ASSIGN_PARTICIPANTS_TASK_CODE &&
      !hasRequiredParticipants(context.participants)
    ) {
      return fail('PARTICIPANTS_REQUIRED');
    }
    if (task.requiresEvidence && !(await hasEvidence(context.executor, taskId))) {
      return fail('EVIDENCE_REQUIRED');
    }
    const definition = await findTaskEvidenceDefinition(context.executor, taskId);
    if (definition && resolveEvidenceForm(definition.code, definition.evidenceForm)?.requiresPhoto &&
        await countEvidencePhotos(context.executor, taskId) === 0) {
      return fail('EVIDENCE_PHOTO_REQUIRED');
    }

    await context.changeTask(taskId, {
      status: 'COMPLETED',
      completedAt: context.now,
      completedBy: actor.id,
      ...(task.startedAt ? {} : { startedAt: context.now }),
    });
    context.record({ taskId, eventType: 'TASK_COMPLETED', details: { code: task.code } });
    await context.activateReadyTasks();
    await context.completeWorkflowIfFinished();
    return succeed({ workflowId: context.workflow.id });
  });
}
