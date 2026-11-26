import { fail, succeed, type Result } from '../../../platform/result.js';
import { findUserNames } from '../../identity/persistence/users-repository.js';
import {
  addBusinessCalendarDays,
  businessDayKey,
  businessLocalToInstant,
  isOverdue,
} from '../domain/due-date.js';
import { resolveEvidenceForm } from '../domain/evidence-forms.js';
import { isAdmin, type Actor } from '../domain/task-rules.js';
import type { WorkflowStatus } from '../domain/statuses.js';
import {
  findCurrentParticipants,
  findEvidenceOfWorkflow,
  findPropertyDates,
  findPropertySummary,
  listPropertiesWithWorkflow,
  listWorkflowSummaries,
  listWorkflowFilterOptions,
  findTaskRequirements,
  findTasksOfUser,
  findWorkflow,
  findWorkflowEvents,
  findWorkflowTasks,
  isUserInvolvedInWorkflow,
} from '../persistence/workflow-repository.js';
import type { WorkflowDependencies } from './workflow-dependencies.js';

type ReadFailure = 'WORKFLOW_NOT_FOUND' | 'FORBIDDEN';

async function authorizeRead(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
): Promise<Result<true, ReadFailure>> {
  const { db } = dependencies.database;
  if (!(await findWorkflow(db, workflowId))) return fail('WORKFLOW_NOT_FOUND');
  if (isAdmin(actor) || (await isUserInvolvedInWorkflow(db, workflowId, actor.id))) {
    return succeed(true);
  }
  return fail('FORBIDDEN');
}

const toIso = (date: Date | null): string | null => date?.toISOString() ?? null;

export async function getWorkflowDetail(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
) {
  const authorization = await authorizeRead(dependencies, actor, workflowId);
  if (!authorization.isSuccess) return authorization;

  const { db } = dependencies.database;
  const workflow = await findWorkflow(db, workflowId);
  if (!workflow) return fail('WORKFLOW_NOT_FOUND' as const);
  const [dates, property, tasks, participants, requirements, evidenceByTask] = await Promise.all([
    findPropertyDates(db, workflow.propertyId),
    findPropertySummary(db, workflow.propertyId),
    findWorkflowTasks(db, workflowId),
    findCurrentParticipants(db, workflowId),
    findTaskRequirements(db, workflow.templateId),
    findEvidenceOfWorkflow(db, workflowId),
  ]);
  const names = await findUserNames(db, [
    ...participants.map((participant) => participant.userId),
    ...tasks
      .flatMap((task) => [task.assignedUserId, task.backupUserId])
      .filter((userId): userId is number => userId !== null),
  ]);
  const codeByDefinition = new Map(tasks.map((task) => [task.definitionId, task.code]));
  const person = (userId: number | null) =>
    userId === null ? null : { id: userId, name: names.get(userId) ?? null };
  const now = dependencies.clock.now();

  return succeed({
    id: workflow.id,
    status: workflow.status,
    propertyId: workflow.propertyId,
    property: property ?? null,
    auctionAt: toIso(dates?.auctionAt ?? null),
    participants: participants.map((participant) => ({
      participantType: participant.participantType,
      assignmentType: participant.assignmentType,
      user: person(participant.userId),
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      code: task.code,
      name: task.name,
      description: task.description,
      responsibleRole: task.responsibleRole,
      displayOrder: task.displayOrder,
      status: task.status,
      assignee: person(task.assignedUserId),
      backup: person(task.backupUserId),
      dependsOn: (requirements.get(task.definitionId) ?? []).map(
        (definitionId) => codeByDefinition.get(definitionId) ?? null,
      ),
      deadline: {
        dueReference: task.dueReference,
        dueOffsetDays: task.dueOffsetDays,
        dueOffsetMinutes: task.dueOffsetMinutes,
      },
      dueAt: toIso(task.dueAt),
      isOverdue:
        (task.status === 'READY' || task.status === 'IN_PROGRESS') && isOverdue(task.dueAt, now),
      activatedAt: toIso(task.activatedAt),
      completedAt: toIso(task.completedAt),
      requiresEvidence: task.requiresEvidence,
      evidenceForm: resolveEvidenceForm(task.code, task.evidenceForm),
      evidence: evidenceOf(evidenceByTask.get(task.id)),
    })),
  });
}

function evidenceOf(
  evidence: { formData: unknown; submittedBy: number; updatedAt: Date } | undefined,
) {
  if (!evidence) return null;
  return {
    formData: evidence.formData,
    submittedBy: evidence.submittedBy,
    updatedAt: evidence.updatedAt.toISOString(),
  };
}

export interface PageQuery {
  readonly limit: number;
  readonly offset: number;
}

export interface WorkflowPageQuery extends PageQuery {
  readonly status?: WorkflowStatus | undefined;
  readonly responsibleUserId?: number | undefined;
  readonly commune?: string | undefined;
  readonly region?: string | undefined;
  readonly auctionFrom?: Date | undefined;
  readonly auctionTo?: Date | undefined;
}

// Tablero: ADMIN ve todos los workflows; los demás, aquellos en que participan.
export async function listWorkflows(
  dependencies: WorkflowDependencies,
  actor: Actor,
  page: WorkflowPageQuery,
) {
  const visibleToUserId = isAdmin(actor) ? null : actor.id;
  const [{ rows, total }, filterOptions] = await Promise.all([
    listWorkflowSummaries(dependencies.database.db, {
      visibleToUserId,
      now: dependencies.clock.now(),
      ...page,
    }),
    listWorkflowFilterOptions(dependencies.database.db, visibleToUserId),
  ]);
  return {
    workflows: rows.map((row) => ({
      id: row.id,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      property: {
        id: row.propertyId,
        title: row.propertyTitle,
        commune: row.commune,
        region: row.region,
      },
      auctionAt: toIso(row.auctionAt),
      openTaskCount: row.openTaskCount,
      overdueTaskCount: row.overdueTaskCount,
      currentTask:
        row.currentTaskName === null
          ? null
          : { name: row.currentTaskName, responsibleName: row.currentTaskResponsibleName },
    })),
    total,
    filterOptions,
    ...page,
  };
}

export async function listProperties(
  dependencies: WorkflowDependencies,
  query: PageQuery & { onlyWithoutWorkflow: boolean },
) {
  const { rows, total } = await listPropertiesWithWorkflow(dependencies.database.db, query);
  return {
    properties: rows.map((row) => ({
      id: row.id,
      adminNewId: row.adminNewId,
      title: row.title,
      address: row.address,
      commune: row.commune,
      auctionAt: toIso(row.auctionAt),
      workflow: row.workflowId === null ? null : { id: row.workflowId, status: row.workflowStatus },
    })),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getWorkflowEvents(
  dependencies: WorkflowDependencies,
  actor: Actor,
  workflowId: number,
) {
  const authorization = await authorizeRead(dependencies, actor, workflowId);
  if (!authorization.isSuccess) return authorization;

  const events = await findWorkflowEvents(dependencies.database.db, workflowId);
  return succeed(events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })));
}

// Bandeja: tareas abiertas donde el usuario es titular o suplente, en workflows activos.
export async function listMyTasks(
  dependencies: WorkflowDependencies,
  actor: Actor,
  page: PageQuery,
) {
  const now = dependencies.clock.now();
  const [year, month, day] = businessDayKey(now).split('-').map(Number);
  const todayStart = businessLocalToInstant({ year: year ?? 0, month: month ?? 0, day: day ?? 0 });
  const tomorrowStart = addBusinessCalendarDays(todayStart, 1);
  const weekEnd = addBusinessCalendarDays(todayStart, 7);
  const { rows, total, metrics } = await findTasksOfUser(dependencies.database.db, actor.id, {
    ...page,
    now,
    todayStart,
    tomorrowStart,
    weekEnd,
  });
  return {
    tasks: rows.map((task) => ({
      id: task.id,
      workflowId: task.workflowId,
      code: task.code,
      name: task.name,
      description: task.description,
      status: task.status,
      dueAt: toIso(task.dueAt),
      isOverdue: isOverdue(task.dueAt, now),
      role: task.assignedUserId === actor.id ? ('ASSIGNEE' as const) : ('BACKUP' as const),
      property: {
        id: task.propertyId,
        title: task.propertyTitle,
        address: task.propertyAddress,
        commune: task.propertyCommune,
        auctionAt: toIso(task.auctionAt),
      },
    })),
    total,
    metrics,
    ...page,
  };
}
