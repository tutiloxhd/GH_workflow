import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { properties } from '../../../platform/database/schema/admin-new-sync.schema.js';
import { users } from '../../../platform/database/schema/identity.schema.js';
import {
  taskDefinitions,
  taskDependencies,
  taskEvidenceSubmissions,
  taskInstances,
  workflowEvents,
  workflowInstances,
  workflowParticipants,
  workflowReprogrammings,
  workflowTemplates,
} from '../../../platform/database/schema/workflow.schema.js';
import {
  notificationOutbox,
  notificationRuleSets,
  workflowNotificationRuleSets,
} from '../../../platform/database/schema/notification.schema.js';
import type { RoleCode } from '../../identity/domain/role-code.js';
import type { BusinessDates, DueReference } from '../domain/due-date.js';
import type {
  AssignmentType,
  CurrentParticipant,
  ParticipantType,
} from '../domain/participants.js';
import type { ResumableTaskStatus, TaskStatus, WorkflowStatus } from '../domain/statuses.js';
import type { WorkflowEventType } from '../domain/workflow-events.js';

// ───────────── Plantilla y propiedad ─────────────

export async function findActiveTemplateId(executor: DatabaseExecutor): Promise<number | null> {
  const [template] = await executor
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.isActive, true))
    .orderBy(desc(workflowTemplates.version))
    .limit(1);
  return template?.id ?? null;
}

export async function findTaskRequirements(
  executor: DatabaseExecutor,
  templateId: number,
): Promise<Map<number, number[]>> {
  const rows = await executor
    .select({
      definitionId: taskDependencies.taskDefinitionId,
      requirementId: taskDependencies.dependsOnTaskDefinitionId,
    })
    .from(taskDependencies)
    .innerJoin(taskDefinitions, eq(taskDefinitions.id, taskDependencies.taskDefinitionId))
    .where(eq(taskDefinitions.workflowTemplateId, templateId));

  const requirements = new Map<number, number[]>();
  for (const row of rows) {
    requirements.set(row.definitionId, [
      ...(requirements.get(row.definitionId) ?? []),
      row.requirementId,
    ]);
  }
  return requirements;
}

export interface PropertyDates extends BusinessDates {
  readonly propertyId: number;
}

export async function findPropertyDates(
  executor: DatabaseExecutor,
  propertyId: number,
): Promise<PropertyDates | undefined> {
  const [property] = await executor
    .select({
      propertyId: properties.id,
      auctionAt: properties.auctionAt,
      guaranteePaymentAt: properties.guaranteePaymentAt,
      guaranteeReturnAt: properties.guaranteeReturnAt,
      balancePaymentAt: properties.balancePaymentAt,
    })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return property;
}

export async function findPropertySummary(executor: DatabaseExecutor, propertyId: number) {
  const [property] = await executor
    .select({
      id: properties.id,
      title: properties.title,
      address: properties.address,
      commune: properties.commune,
      caseReference: properties.caseReference,
      tribunal: properties.tribunal,
      auctionBidderName: properties.auctionBidderName,
      auctionPayerName: properties.auctionPayerName,
    })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return property;
}

const OPEN_TASK_STATUSES_SQL = sql.raw(`'READY', 'IN_PROGRESS'`);

// Resumen para el tablero. `visibleToUserId` null = todos (ADMIN); si no, solo los workflows
// donde el usuario tiene un puesto vigente o alguna tarea.
export async function listWorkflowSummaries(
  executor: DatabaseExecutor,
  query: {
    visibleToUserId: number | null;
    now: Date;
    limit: number;
    offset: number;
    status?: WorkflowStatus | undefined;
    responsibleUserId?: number | undefined;
    commune?: string | undefined;
    region?: string | undefined;
    auctionFrom?: Date | undefined;
    auctionTo?: Date | undefined;
  },
) {
  const visibility =
    query.visibleToUserId === null
      ? undefined
      : sql`(EXISTS (SELECT 1 FROM workflow_participants wp
                      WHERE wp.workflow_instance_id = ${workflowInstances.id}
                        AND wp.user_id = ${query.visibleToUserId} AND wp.valid_to IS NULL)
             OR EXISTS (SELECT 1 FROM task_instances ti
                         WHERE ti.workflow_instance_id = ${workflowInstances.id}
                           AND (ti.assigned_user_id = ${query.visibleToUserId}
                                OR ti.backup_user_id = ${query.visibleToUserId})))`;

  const filters = and(
    visibility,
    query.status ? eq(workflowInstances.status, query.status) : undefined,
    query.commune
      ? sql`LOWER(${properties.commune}) LIKE ${`%${query.commune.toLowerCase()}%`}`
      : undefined,
    query.region
      ? sql`LOWER(${properties.region}) LIKE ${`%${query.region.toLowerCase()}%`}`
      : undefined,
    query.responsibleUserId
      ? sql`EXISTS (SELECT 1 FROM ${taskInstances} filter_task
          WHERE filter_task.workflow_instance_id = ${workflowInstances.id}
            AND filter_task.status IN (${OPEN_TASK_STATUSES_SQL})
            AND (filter_task.assigned_user_id = ${query.responsibleUserId}
              OR filter_task.backup_user_id = ${query.responsibleUserId}))`
      : undefined,
    query.auctionFrom ? gte(properties.auctionAt, query.auctionFrom) : undefined,
    query.auctionTo ? lt(properties.auctionAt, query.auctionTo) : undefined,
  );

  const rows = await executor
    .select({
      id: workflowInstances.id,
      status: workflowInstances.status,
      startedAt: workflowInstances.startedAt,
      propertyId: properties.id,
      propertyTitle: properties.title,
      commune: properties.commune,
      region: properties.region,
      auctionAt: properties.auctionAt,
      openTaskCount: sql<number>`(SELECT COUNT(*) FROM task_instances ti
        WHERE ti.workflow_instance_id = ${workflowInstances.id}
          AND ti.status IN (${OPEN_TASK_STATUSES_SQL}))`.mapWith(Number),
      overdueTaskCount: sql<number>`(SELECT COUNT(*) FROM task_instances ti
        WHERE ti.workflow_instance_id = ${workflowInstances.id}
          AND ti.status IN (${OPEN_TASK_STATUSES_SQL}) AND ti.due_at < ${query.now})`.mapWith(
        Number,
      ),
    })
    .from(workflowInstances)
    .innerJoin(properties, eq(properties.id, workflowInstances.propertyId))
    .where(filters)
    .orderBy(
      sql`${properties.auctionAt} IS NULL`,
      asc(properties.auctionAt),
      asc(workflowInstances.id),
    )
    .limit(query.limit)
    .offset(query.offset);
  const [totalRow] = await executor
    .select({ total: count() })
    .from(workflowInstances)
    .innerJoin(properties, eq(properties.id, workflowInstances.propertyId))
    .where(filters);
  return { rows, total: totalRow?.total ?? 0 };
}

export async function listWorkflowFilterOptions(
  executor: DatabaseExecutor,
  visibleToUserId: number | null,
) {
  const visibility =
    visibleToUserId === null
      ? undefined
      : sql`(EXISTS (SELECT 1 FROM workflow_participants wp
                      WHERE wp.workflow_instance_id = ${workflowInstances.id}
                        AND wp.user_id = ${visibleToUserId} AND wp.valid_to IS NULL)
             OR EXISTS (SELECT 1 FROM task_instances ti
                         WHERE ti.workflow_instance_id = ${workflowInstances.id}
                           AND (ti.assigned_user_id = ${visibleToUserId}
                                OR ti.backup_user_id = ${visibleToUserId})))`;
  const [locations, responsibles] = await Promise.all([
    executor
      .selectDistinct({ commune: properties.commune, region: properties.region })
      .from(workflowInstances)
      .innerJoin(properties, eq(properties.id, workflowInstances.propertyId))
      .where(visibility),
    executor
      .selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(
        taskInstances,
        or(eq(taskInstances.assignedUserId, users.id), eq(taskInstances.backupUserId, users.id)),
      )
      .innerJoin(workflowInstances, eq(workflowInstances.id, taskInstances.workflowInstanceId))
      .where(and(visibility, inArray(taskInstances.status, ['READY', 'IN_PROGRESS']))),
  ]);
  return {
    communes: [...new Set(locations.map(({ commune }) => commune).filter((value) => value !== null))].sort(),
    regions: [...new Set(locations.map(({ region }) => region).filter((value) => value !== null))].sort(),
    responsibles: responsibles.sort((left, right) => left.name.localeCompare(right.name, 'es')),
  };
}

export async function listPropertiesWithWorkflow(
  executor: DatabaseExecutor,
  query: { onlyWithoutWorkflow: boolean; limit: number; offset: number },
) {
  const filter = query.onlyWithoutWorkflow ? isNull(workflowInstances.id) : undefined;
  const rows = await executor
    .select({
      id: properties.id,
      adminNewId: properties.adminNewId,
      title: properties.title,
      address: properties.address,
      commune: properties.commune,
      auctionAt: properties.auctionAt,
      workflowId: workflowInstances.id,
      workflowStatus: workflowInstances.status,
    })
    .from(properties)
    .leftJoin(workflowInstances, eq(workflowInstances.propertyId, properties.id))
    .where(filter)
    .orderBy(sql`${properties.auctionAt} IS NULL`, asc(properties.auctionAt), asc(properties.id))
    .limit(query.limit)
    .offset(query.offset);
  const [totalRow] = await executor
    .select({ total: count() })
    .from(properties)
    .leftJoin(workflowInstances, eq(workflowInstances.propertyId, properties.id))
    .where(filter);
  return { rows, total: totalRow?.total ?? 0 };
}

export async function updatePropertyAuctionAt(
  executor: DatabaseExecutor,
  propertyId: number,
  auctionAt: Date,
): Promise<void> {
  await executor.update(properties).set({ auctionAt }).where(eq(properties.id, propertyId));
}

export async function updatePropertyBusinessDates(
  executor: DatabaseExecutor,
  propertyId: number,
  dates: Partial<BusinessDates>,
): Promise<void> {
  await executor.update(properties).set(dates).where(eq(properties.id, propertyId));
}

// ───────────── Instancia ─────────────

export interface WorkflowRecord {
  readonly id: number;
  readonly propertyId: number;
  readonly templateId: number;
  readonly status: WorkflowStatus;
}

const workflowColumns = {
  id: workflowInstances.id,
  propertyId: workflowInstances.propertyId,
  templateId: workflowInstances.workflowTemplateId,
  status: workflowInstances.status,
};

export async function findWorkflowIdByProperty(
  executor: DatabaseExecutor,
  propertyId: number,
): Promise<number | null> {
  const [workflow] = await executor
    .select({ id: workflowInstances.id })
    .from(workflowInstances)
    .where(eq(workflowInstances.propertyId, propertyId));
  return workflow?.id ?? null;
}

export async function insertWorkflow(
  executor: DatabaseExecutor,
  workflow: { propertyId: number; templateId: number; startedAt: Date },
): Promise<number> {
  const [inserted] = await executor
    .insert(workflowInstances)
    .values({
      propertyId: workflow.propertyId,
      workflowTemplateId: workflow.templateId,
      startedAt: workflow.startedAt,
    })
    .$returningId();
  if (!inserted) throw new Error('La inserción del workflow no devolvió identificador');
  return inserted.id;
}

// Bloquea la instancia: todos los comandos sobre un workflow se serializan aquí.
export async function lockWorkflow(
  executor: DatabaseExecutor,
  workflowId: number,
): Promise<WorkflowRecord | undefined> {
  const [workflow] = await executor
    .select(workflowColumns)
    .from(workflowInstances)
    .where(eq(workflowInstances.id, workflowId))
    .for('update');
  return workflow;
}

export async function findWorkflow(
  executor: DatabaseExecutor,
  workflowId: number,
): Promise<WorkflowRecord | undefined> {
  const [workflow] = await executor
    .select(workflowColumns)
    .from(workflowInstances)
    .where(eq(workflowInstances.id, workflowId));
  return workflow;
}

export async function updateWorkflow(
  executor: DatabaseExecutor,
  workflowId: number,
  changes: Partial<{
    status: WorkflowStatus;
    suspendedAt: Date | null;
    cancelledAt: Date;
    completedAt: Date;
  }>,
): Promise<void> {
  await executor
    .update(workflowInstances)
    .set({ ...changes, lockVersion: sql`${workflowInstances.lockVersion} + 1` })
    .where(eq(workflowInstances.id, workflowId));
}

export async function findWorkflowIdOfTask(
  executor: DatabaseExecutor,
  taskId: number,
): Promise<number | null> {
  const [task] = await executor
    .select({ workflowId: taskInstances.workflowInstanceId })
    .from(taskInstances)
    .where(eq(taskInstances.id, taskId));
  return task?.workflowId ?? null;
}

// ───────────── Tareas ─────────────

export interface TaskRecord {
  readonly id: number;
  readonly definitionId: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly responsibleRole: RoleCode;
  readonly displayOrder: number;
  readonly requiresEvidence: boolean;
  readonly status: TaskStatus;
  readonly statusBeforeSuspension: ResumableTaskStatus | null;
  readonly assignedUserId: number | null;
  readonly backupUserId: number | null;
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
  readonly dueAt: Date | null;
  readonly dueReferenceAt: Date | null;
  readonly activatedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly completedBy: number | null;
}

// Materializa las tareas de la plantilla, con una copia editable del plazo de cada una.
export async function insertTasksFromTemplate(
  executor: DatabaseExecutor,
  workflowId: number,
  templateId: number,
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO task_instances
      (workflow_instance_id, task_definition_id, status, due_reference, due_offset_days,
       due_offset_minutes)
    SELECT ${workflowId}, id, 'BLOCKED', due_reference, due_offset_days, due_offset_minutes
      FROM task_definitions
     WHERE workflow_template_id = ${templateId}`);
}

export async function assignPublishedNotificationRuleSet(
  executor: DatabaseExecutor,
  workflowId: number,
  templateId: number,
): Promise<void> {
  const [ruleSet] = await executor
    .select({ id: notificationRuleSets.id })
    .from(notificationRuleSets)
    .where(
      and(
        eq(notificationRuleSets.workflowTemplateId, templateId),
        eq(notificationRuleSets.isPublished, 1),
      ),
    )
    .orderBy(desc(notificationRuleSets.version))
    .limit(1);
  if (!ruleSet) throw new Error('La plantilla activa no tiene reglas de notificación publicadas');
  await executor
    .insert(workflowNotificationRuleSets)
    .values({ workflowInstanceId: workflowId, ruleSetId: ruleSet.id });
}

export async function findWorkflowTasks(
  executor: DatabaseExecutor,
  workflowId: number,
): Promise<TaskRecord[]> {
  return executor
    .select({
      id: taskInstances.id,
      definitionId: taskInstances.taskDefinitionId,
      code: taskDefinitions.code,
      name: taskDefinitions.name,
      description: taskDefinitions.description,
      responsibleRole: taskDefinitions.responsibleRole,
      displayOrder: taskDefinitions.displayOrder,
      requiresEvidence: taskDefinitions.requiresEvidence,
      status: taskInstances.status,
      statusBeforeSuspension: taskInstances.statusBeforeSuspension,
      assignedUserId: taskInstances.assignedUserId,
      backupUserId: taskInstances.backupUserId,
      dueReference: taskInstances.dueReference,
      dueOffsetDays: taskInstances.dueOffsetDays,
      dueOffsetMinutes: taskInstances.dueOffsetMinutes,
      dueAt: taskInstances.dueAt,
      dueReferenceAt: taskInstances.dueReferenceAt,
      activatedAt: taskInstances.activatedAt,
      startedAt: taskInstances.startedAt,
      completedAt: taskInstances.completedAt,
      completedBy: taskInstances.completedBy,
    })
    .from(taskInstances)
    .innerJoin(taskDefinitions, eq(taskDefinitions.id, taskInstances.taskDefinitionId))
    .where(eq(taskInstances.workflowInstanceId, workflowId))
    .orderBy(asc(taskDefinitions.displayOrder), asc(taskInstances.id));
}

export type TaskChanges = Partial<{
  status: TaskStatus;
  statusBeforeSuspension: ResumableTaskStatus | null;
  assignedUserId: number | null;
  backupUserId: number | null;
  dueReference: DueReference;
  dueOffsetDays: number;
  dueOffsetMinutes: number;
  dueAt: Date | null;
  dueReferenceAt: Date | null;
  activatedAt: Date;
  startedAt: Date;
  completedAt: Date;
  completedBy: number | null;
}>;

export async function updateTask(
  executor: DatabaseExecutor,
  taskId: number,
  changes: TaskChanges,
): Promise<void> {
  await executor
    .update(taskInstances)
    .set({ ...changes, lockVersion: sql`${taskInstances.lockVersion} + 1` })
    .where(eq(taskInstances.id, taskId));
}

export async function findTaskCode(
  executor: DatabaseExecutor,
  taskId: number,
): Promise<string | null> {
  const [task] = await executor
    .select({ code: taskDefinitions.code })
    .from(taskInstances)
    .innerJoin(taskDefinitions, eq(taskDefinitions.id, taskInstances.taskDefinitionId))
    .where(eq(taskInstances.id, taskId));
  return task?.code ?? null;
}

// Un formulario vigente por tarea: enviarlo de nuevo reemplaza el anterior.
export async function upsertEvidence(
  executor: DatabaseExecutor,
  evidence: {
    taskId: number;
    submittedBy: number;
    formData: Record<string, unknown>;
    submittedAt: Date;
  },
): Promise<void> {
  await executor
    .insert(taskEvidenceSubmissions)
    .values({
      taskInstanceId: evidence.taskId,
      submittedBy: evidence.submittedBy,
      formData: evidence.formData,
      submittedAt: evidence.submittedAt,
      updatedAt: evidence.submittedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        submittedBy: evidence.submittedBy,
        formData: evidence.formData,
        updatedAt: evidence.submittedAt,
      },
    });
}

export async function findEvidenceOfWorkflow(
  executor: DatabaseExecutor,
  workflowId: number,
): Promise<Map<number, { formData: unknown; submittedBy: number; updatedAt: Date }>> {
  const rows = await executor
    .select({
      taskId: taskEvidenceSubmissions.taskInstanceId,
      formData: taskEvidenceSubmissions.formData,
      submittedBy: taskEvidenceSubmissions.submittedBy,
      updatedAt: taskEvidenceSubmissions.updatedAt,
    })
    .from(taskEvidenceSubmissions)
    .innerJoin(taskInstances, eq(taskInstances.id, taskEvidenceSubmissions.taskInstanceId))
    .where(eq(taskInstances.workflowInstanceId, workflowId));
  return new Map(rows.map(({ taskId, ...evidence }) => [taskId, evidence]));
}

export async function hasEvidence(executor: DatabaseExecutor, taskId: number): Promise<boolean> {
  const [submission] = await executor
    .select({ id: taskEvidenceSubmissions.id })
    .from(taskEvidenceSubmissions)
    .where(eq(taskEvidenceSubmissions.taskInstanceId, taskId))
    .limit(1);
  return submission !== undefined;
}

// ───────────── Participantes ─────────────

export async function findCurrentParticipants(
  executor: DatabaseExecutor,
  workflowId: number,
): Promise<CurrentParticipant[]> {
  return executor
    .select({
      participantType: workflowParticipants.participantType,
      assignmentType: workflowParticipants.assignmentType,
      userId: workflowParticipants.userId,
    })
    .from(workflowParticipants)
    .where(
      and(
        eq(workflowParticipants.workflowInstanceId, workflowId),
        isNull(workflowParticipants.validTo),
      ),
    );
}

// Las asignaciones no se sobrescriben: se cierra la vigente y se abre otra.
export async function endCurrentParticipants(
  executor: DatabaseExecutor,
  workflowId: number,
  participantType: ParticipantType,
  endedAt: Date,
): Promise<void> {
  await executor
    .update(workflowParticipants)
    .set({ validTo: endedAt })
    .where(
      and(
        eq(workflowParticipants.workflowInstanceId, workflowId),
        eq(workflowParticipants.participantType, participantType),
        isNull(workflowParticipants.validTo),
      ),
    );
}

export async function insertParticipant(
  executor: DatabaseExecutor,
  participant: {
    workflowId: number;
    userId: number;
    participantType: ParticipantType;
    assignmentType: AssignmentType;
    validFrom: Date;
    assignedBy: number | null;
  },
): Promise<void> {
  await executor.insert(workflowParticipants).values({
    workflowInstanceId: participant.workflowId,
    userId: participant.userId,
    participantType: participant.participantType,
    assignmentType: participant.assignmentType,
    validFrom: participant.validFrom,
    assignedBy: participant.assignedBy,
  });
}

// Un usuario «participa» si tiene un puesto vigente o alguna tarea a su nombre.
export async function isUserInvolvedInWorkflow(
  executor: DatabaseExecutor,
  workflowId: number,
  userId: number,
): Promise<boolean> {
  const [participant] = await executor
    .select({ id: workflowParticipants.id })
    .from(workflowParticipants)
    .where(
      and(
        eq(workflowParticipants.workflowInstanceId, workflowId),
        eq(workflowParticipants.userId, userId),
        isNull(workflowParticipants.validTo),
      ),
    )
    .limit(1);
  if (participant) return true;

  const [task] = await executor
    .select({ id: taskInstances.id })
    .from(taskInstances)
    .where(
      and(
        eq(taskInstances.workflowInstanceId, workflowId),
        or(eq(taskInstances.assignedUserId, userId), eq(taskInstances.backupUserId, userId)),
      ),
    )
    .limit(1);
  return task !== undefined;
}

// ───────────── Historial y reprogramaciones ─────────────

export interface NewWorkflowEvent {
  readonly workflowId: number;
  readonly taskId?: number;
  readonly actorUserId: number | null;
  readonly eventSource?: 'USER' | 'SYSTEM' | 'SYNC';
  readonly eventType: WorkflowEventType;
  readonly details?: Record<string, unknown>;
}

export async function insertEvents(
  executor: DatabaseExecutor,
  events: readonly NewWorkflowEvent[],
  occurredAt: Date,
): Promise<void> {
  if (events.length === 0) return;
  const insertedEvents = await executor
    .insert(workflowEvents)
    .values(
      events.map((event) => ({
        workflowInstanceId: event.workflowId,
        taskInstanceId: event.taskId ?? null,
        actorUserId: event.actorUserId,
        eventType: event.eventType,
        eventSource:
          event.eventSource ??
          (event.actorUserId === null ? ('SYSTEM' as const) : ('USER' as const)),
        details: event.details ?? null,
        occurredAt,
      })),
    )
    .$returningId();
  await executor.insert(notificationOutbox).values(
    events.map((event, index) => {
      const inserted = insertedEvents[index];
      if (!inserted) throw new Error('El evento de workflow no devolvió identificador');
      return {
        workflowEventId: inserted.id,
        eventType: event.eventType,
        workflowInstanceId: event.workflowId,
        taskInstanceId: event.taskId ?? null,
        payload: event.details ?? null,
        availableAt: occurredAt,
      };
    }),
  );
}

export async function findWorkflowEvents(executor: DatabaseExecutor, workflowId: number) {
  return executor
    .select({
      id: workflowEvents.id,
      taskId: workflowEvents.taskInstanceId,
      actorUserId: workflowEvents.actorUserId,
      eventType: workflowEvents.eventType,
      eventSource: workflowEvents.eventSource,
      details: workflowEvents.details,
      occurredAt: workflowEvents.occurredAt,
    })
    .from(workflowEvents)
    .where(eq(workflowEvents.workflowInstanceId, workflowId))
    .orderBy(asc(workflowEvents.id));
}

export async function insertAppliedReprogramming(
  executor: DatabaseExecutor,
  reprogramming: {
    workflowId: number;
    previousAuctionAt: Date | null;
    newAuctionAt: Date;
    reason: string | null;
    requestedBy: number;
    appliedAt: Date;
  },
): Promise<void> {
  await executor.insert(workflowReprogrammings).values({
    workflowInstanceId: reprogramming.workflowId,
    previousAuctionAt: reprogramming.previousAuctionAt,
    newAuctionAt: reprogramming.newAuctionAt,
    origin: 'USER',
    reason: reprogramming.reason,
    requestedBy: reprogramming.requestedBy,
    status: 'APPLIED',
    createdAt: reprogramming.appliedAt,
    appliedAt: reprogramming.appliedAt,
  });
}

// ───────────── Bandeja ─────────────

export async function findTasksOfUser(executor: DatabaseExecutor, userId: number) {
  return executor
    .select({
      id: taskInstances.id,
      workflowId: taskInstances.workflowInstanceId,
      code: taskDefinitions.code,
      name: taskDefinitions.name,
      description: taskDefinitions.description,
      status: taskInstances.status,
      dueAt: taskInstances.dueAt,
      assignedUserId: taskInstances.assignedUserId,
      backupUserId: taskInstances.backupUserId,
      propertyId: properties.id,
      propertyTitle: properties.title,
      propertyAddress: properties.address,
      propertyCommune: properties.commune,
      auctionAt: properties.auctionAt,
    })
    .from(taskInstances)
    .innerJoin(taskDefinitions, eq(taskDefinitions.id, taskInstances.taskDefinitionId))
    .innerJoin(workflowInstances, eq(workflowInstances.id, taskInstances.workflowInstanceId))
    .innerJoin(properties, eq(properties.id, workflowInstances.propertyId))
    .where(
      and(
        or(eq(taskInstances.assignedUserId, userId), eq(taskInstances.backupUserId, userId)),
        inArray(taskInstances.status, ['READY', 'IN_PROGRESS']),
        eq(workflowInstances.status, 'ACTIVE'),
      ),
    )
    .orderBy(sql`${taskInstances.dueAt} IS NULL`, asc(taskInstances.dueAt), asc(taskInstances.id));
}
