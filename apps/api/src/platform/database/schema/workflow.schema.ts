import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { properties, propertySourceChanges } from './admin-new-sync.schema.js';
import { createdAt, primaryId, referenceId, updatedAt, utcDateTime } from './columns.js';
import { ROLE_CODES } from '../../../modules/identity/domain/role-code.js';
import { users } from './identity.schema.js';

import {
  DEADLINE_DAY_KINDS,
  DEFAULT_DUE_OFFSET_DAYS,
  DUE_REFERENCES,
} from '../../../modules/workflow/domain/due-date.js';
import {
  ASSIGNMENT_TYPES,
  PARTICIPANT_TYPES,
} from '../../../modules/workflow/domain/participants.js';
import { TASK_STATUSES, WORKFLOW_STATUSES } from '../../../modules/workflow/domain/statuses.js';
import { TEMPLATE_STATUSES } from '../../../modules/workflow-templates/domain/template-definition.js';

export const REPROGRAMMING_ORIGINS = ['SYNC', 'USER'] as const;
export const REPROGRAMMING_STATUSES = ['PENDING', 'APPLIED', 'FAILED', 'CANCELLED'] as const;
export const EVENT_SOURCES = ['USER', 'SYSTEM', 'SYNC'] as const;

const DUE_REFERENCE_SQL_LIST = sql.raw(
  DUE_REFERENCES.map((reference) => `'${reference}'`).join(', '),
);

// Plazo de una tarea: referencia temporal + días de calendario en Santiago + minutos.
const deadlineColumns = () => ({
  dueReference: varchar('due_reference', { length: 30, enum: DUE_REFERENCES })
    .notNull()
    .default('TASK_ACTIVATED_AT'),
  dueOffsetDays: int('due_offset_days').notNull().default(DEFAULT_DUE_OFFSET_DAYS),
  dueOffsetMinutes: int('due_offset_minutes').notNull().default(0),
});

// ───────────── Definición (plantilla versionada) ─────────────

export const workflowTemplates = mysqlTable(
  'workflow_templates',
  {
    id: primaryId(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    version: int('version', { unsigned: true }).notNull(),
    // Por omisión PUBLISHED: las plantillas cargadas por seed ya están publicadas. La aplicación
    // crea los borradores indicando DRAFT explícitamente.
    status: varchar('status', { length: 20, enum: TEMPLATE_STATUSES })
      .notNull()
      .default('PUBLISHED'),
    isActive: boolean('is_active').notNull().default(false),
    // Cómo se cuentan los días de los plazos. Por omisión CALENDAR: las plantillas heredadas y
    // las de seed cuentan días corridos; la aplicación crea los borradores con BUSINESS.
    deadlineDayKind: varchar('deadline_day_kind', { length: 20, enum: DEADLINE_DAY_KINDS })
      .notNull()
      .default('CALENDAR'),
    createdBy: referenceId('created_by'),
    publishedBy: referenceId('published_by'),
    publishedAt: utcDateTime('published_at'),
    archivedBy: referenceId('archived_by'),
    archivedAt: utcDateTime('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_workflow_templates_code_version').on(table.code, table.version),
    foreignKey({
      name: 'fk_workflow_templates_creator',
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_workflow_templates_publisher',
      columns: [table.publishedBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_workflow_templates_archiver',
      columns: [table.archivedBy],
      foreignColumns: [users.id],
    }),
    check(
      'chk_workflow_templates_status',
      sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
    ),
    check(
      'chk_workflow_templates_day_kind',
      sql`${table.deadlineDayKind} IN ('CALENDAR', 'BUSINESS')`,
    ),
    // Solo una versión publicada puede estar activa.
    check(
      'chk_workflow_templates_active_published',
      sql`${table.isActive} = FALSE OR ${table.status} = 'PUBLISHED'`,
    ),
  ],
);

export const taskDefinitions = mysqlTable(
  'task_definitions',
  {
    id: primaryId(),
    workflowTemplateId: referenceId('workflow_template_id').notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    responsibleRole: varchar('responsible_role', { length: 50, enum: ROLE_CODES }).notNull(),
    displayOrder: int('display_order').notNull().default(0),
    requiresEvidence: boolean('requires_evidence').notNull().default(false),
    // Posición en el diagrama del editor de flujos; null = ubicación automática.
    diagramX: int('diagram_x'),
    diagramY: int('diagram_y'),
    // Formulario de evidencia (ADR 0014); null = el inicial del código de la tarea, si tiene.
    evidenceForm: json('evidence_form'),
    // Plazo base de la plantilla; cada workflow recibe una copia editable en task_instances.
    ...deadlineColumns(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_task_definitions_code').on(table.workflowTemplateId, table.code),
    foreignKey({
      name: 'fk_task_definitions_template',
      columns: [table.workflowTemplateId],
      foreignColumns: [workflowTemplates.id],
    }),
    check(
      'chk_task_definitions_role',
      sql`${table.responsibleRole} IN ('ADMIN', 'MANAGER', 'BIDDER', 'LEGAL_REVIEWER')`,
    ),
    check(
      'chk_task_definitions_due_reference',
      sql`${table.dueReference} IN (${DUE_REFERENCE_SQL_LIST})`,
    ),
  ],
);

export const taskDependencies = mysqlTable(
  'task_dependencies',
  {
    taskDefinitionId: referenceId('task_definition_id').notNull(),
    dependsOnTaskDefinitionId: referenceId('depends_on_task_definition_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'pk_task_dependencies',
      columns: [table.taskDefinitionId, table.dependsOnTaskDefinitionId],
    }),
    index('idx_task_dependencies_parent').on(table.dependsOnTaskDefinitionId),
    foreignKey({
      name: 'fk_task_dependencies_task',
      columns: [table.taskDefinitionId],
      foreignColumns: [taskDefinitions.id],
    }),
    foreignKey({
      name: 'fk_task_dependencies_parent',
      columns: [table.dependsOnTaskDefinitionId],
      foreignColumns: [taskDefinitions.id],
    }),
    check(
      'chk_task_dependencies_not_self',
      sql`${table.taskDefinitionId} <> ${table.dependsOnTaskDefinitionId}`,
    ),
  ],
);

// ───────────── Ejecución ─────────────

export const workflowInstances = mysqlTable(
  'workflow_instances',
  {
    id: primaryId(),
    propertyId: referenceId('property_id').notNull(),
    workflowTemplateId: referenceId('workflow_template_id').notNull(),
    status: varchar('status', { length: 20, enum: WORKFLOW_STATUSES }).notNull().default('ACTIVE'),
    startedAt: utcDateTime('started_at').notNull(),
    suspendedAt: utcDateTime('suspended_at'),
    cancelledAt: utcDateTime('cancelled_at'),
    completedAt: utcDateTime('completed_at'),
    lockVersion: int('lock_version', { unsigned: true }).notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Una propiedad nunca tiene dos workflows: garantiza el inicio idempotente.
    uniqueIndex('uq_workflow_instances_property').on(table.propertyId),
    index('idx_workflow_instances_status').on(table.status, table.startedAt),
    foreignKey({
      name: 'fk_workflow_instances_property',
      columns: [table.propertyId],
      foreignColumns: [properties.id],
    }),
    foreignKey({
      name: 'fk_workflow_instances_template',
      columns: [table.workflowTemplateId],
      foreignColumns: [workflowTemplates.id],
    }),
    check(
      'chk_workflow_instances_status',
      sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'COMPLETED')`,
    ),
  ],
);

// Las asignaciones no se sobrescriben: al cambiar se completa valid_to y se crea otra fila.
export const workflowParticipants = mysqlTable(
  'workflow_participants',
  {
    id: primaryId(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    userId: referenceId('user_id').notNull(),
    participantType: varchar('participant_type', { length: 50, enum: PARTICIPANT_TYPES }).notNull(),
    assignmentType: varchar('assignment_type', { length: 20, enum: ASSIGNMENT_TYPES }).notNull(),
    validFrom: utcDateTime('valid_from').notNull(),
    validTo: utcDateTime('valid_to'),
    assignedBy: referenceId('assigned_by'),
    createdAt: createdAt(),
  },
  (table) => [
    index('idx_workflow_participants_current').on(
      table.workflowInstanceId,
      table.participantType,
      table.assignmentType,
      table.validTo,
    ),
    index('idx_workflow_participants_user').on(table.userId, table.validTo),
    foreignKey({
      name: 'fk_workflow_participants_instance',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_workflow_participants_user',
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_workflow_participants_assigner',
      columns: [table.assignedBy],
      foreignColumns: [users.id],
    }),
    check(
      'chk_workflow_participants_type',
      sql`${table.participantType} IN ('MANAGER', 'BIDDER', 'LEGAL_REVIEWER')`,
    ),
    check(
      'chk_workflow_participants_assignment',
      sql`${table.assignmentType} IN ('PRIMARY', 'BACKUP')`,
    ),
    check(
      'chk_workflow_participants_dates',
      sql`${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
    ),
  ],
);

export const workflowReprogrammings = mysqlTable(
  'workflow_reprogrammings',
  {
    id: primaryId(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    sourceChangeId: referenceId('source_change_id'),
    previousAuctionAt: utcDateTime('previous_auction_at'),
    newAuctionAt: utcDateTime('new_auction_at'),
    origin: varchar('origin', { length: 20, enum: REPROGRAMMING_ORIGINS }).notNull(),
    reason: text('reason'),
    requestedBy: referenceId('requested_by'),
    status: varchar('status', { length: 20, enum: REPROGRAMMING_STATUSES })
      .notNull()
      .default('PENDING'),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
    appliedAt: utcDateTime('applied_at'),
  },
  (table) => [
    index('idx_workflow_reprogrammings_instance').on(table.workflowInstanceId, table.createdAt),
    index('idx_workflow_reprogrammings_status').on(table.status, table.createdAt),
    foreignKey({
      name: 'fk_workflow_reprogrammings_instance',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_workflow_reprogrammings_change',
      columns: [table.sourceChangeId],
      foreignColumns: [propertySourceChanges.id],
    }),
    foreignKey({
      name: 'fk_workflow_reprogrammings_requester',
      columns: [table.requestedBy],
      foreignColumns: [users.id],
    }),
    check('chk_workflow_reprogrammings_origin', sql`${table.origin} IN ('SYNC', 'USER')`),
    check(
      'chk_workflow_reprogrammings_status',
      sql`${table.status} IN ('PENDING', 'APPLIED', 'FAILED', 'CANCELLED')`,
    ),
  ],
);

// ───────────── Operación de tareas ─────────────

// «Vencida» no es un estado: se deriva de due_at < ahora con estado READY o IN_PROGRESS.
export const taskInstances = mysqlTable(
  'task_instances',
  {
    id: primaryId(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    taskDefinitionId: referenceId('task_definition_id').notNull(),
    status: varchar('status', { length: 20, enum: TASK_STATUSES }).notNull().default('BLOCKED'),
    // Estado al que vuelve la tarea cuando se reanuda un workflow suspendido.
    statusBeforeSuspension: varchar('status_before_suspension', {
      length: 20,
      enum: ['READY', 'IN_PROGRESS'],
    }),
    assignedUserId: referenceId('assigned_user_id'),
    backupUserId: referenceId('backup_user_id'),
    // Copia del plazo de la plantilla, editable solo para este workflow.
    ...deadlineColumns(),
    dueAt: utcDateTime('due_at'),
    dueReferenceAt: utcDateTime('due_reference_at'),
    activatedAt: utcDateTime('activated_at'),
    startedAt: utcDateTime('started_at'),
    completedAt: utcDateTime('completed_at'),
    completedBy: referenceId('completed_by'),
    lockVersion: int('lock_version', { unsigned: true }).notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_instances_definition').on(
      table.workflowInstanceId,
      table.taskDefinitionId,
    ),
    index('idx_task_instances_assignee').on(table.assignedUserId, table.status, table.dueAt),
    index('idx_task_instances_backup').on(table.backupUserId, table.status, table.dueAt),
    index('idx_task_instances_workflow').on(table.workflowInstanceId, table.status),
    foreignKey({
      name: 'fk_task_instances_workflow',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_task_instances_definition',
      columns: [table.taskDefinitionId],
      foreignColumns: [taskDefinitions.id],
    }),
    foreignKey({
      name: 'fk_task_instances_assignee',
      columns: [table.assignedUserId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_task_instances_backup',
      columns: [table.backupUserId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_task_instances_completed_by',
      columns: [table.completedBy],
      foreignColumns: [users.id],
    }),
    check(
      'chk_task_instances_status',
      sql`${table.status} IN ('BLOCKED', 'READY', 'IN_PROGRESS', 'SUSPENDED', 'COMPLETED', 'CANCELLED')`,
    ),
    check(
      'chk_task_instances_suspension',
      sql`(${table.status} = 'SUSPENDED') = (${table.statusBeforeSuspension} IS NOT NULL)`,
    ),
    check(
      'chk_task_instances_due_reference',
      sql`${table.dueReference} IN (${DUE_REFERENCE_SQL_LIST})`,
    ),
  ],
);

// Un formulario vigente por tarea; el backend valida form_data según el código de la definición.
export const taskEvidenceSubmissions = mysqlTable(
  'task_evidence_submissions',
  {
    id: primaryId(),
    taskInstanceId: referenceId('task_instance_id').notNull(),
    submittedBy: referenceId('submitted_by').notNull(),
    formData: json('form_data').notNull(),
    submittedAt: createdAt('submitted_at'),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_task_evidence_task').on(table.taskInstanceId),
    foreignKey({
      name: 'fk_task_evidence_task',
      columns: [table.taskInstanceId],
      foreignColumns: [taskInstances.id],
    }),
    foreignKey({
      name: 'fk_task_evidence_submitter',
      columns: [table.submittedBy],
      foreignColumns: [users.id],
    }),
  ],
);

// Historial append-only. Los eventos de instancia (creada, suspendida, cancelada…) no llevan tarea.
export const workflowEvents = mysqlTable(
  'workflow_events',
  {
    id: primaryId(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    taskInstanceId: referenceId('task_instance_id'),
    actorUserId: referenceId('actor_user_id'),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    occurrenceKey: varchar('occurrence_key', { length: 190 }),
    eventSource: varchar('event_source', { length: 20, enum: EVENT_SOURCES }).notNull(),
    details: json('details'),
    occurredAt: createdAt('occurred_at'),
  },
  (table) => [
    index('idx_workflow_events_instance').on(table.workflowInstanceId, table.occurredAt),
    index('idx_workflow_events_task').on(table.taskInstanceId, table.occurredAt),
    index('idx_workflow_events_actor').on(table.actorUserId, table.occurredAt),
    uniqueIndex('uq_workflow_events_occurrence').on(table.occurrenceKey),
    foreignKey({
      name: 'fk_workflow_events_instance',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_workflow_events_task',
      columns: [table.taskInstanceId],
      foreignColumns: [taskInstances.id],
    }),
    foreignKey({
      name: 'fk_workflow_events_actor',
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }),
    check('chk_workflow_events_source', sql`${table.eventSource} IN ('USER', 'SYSTEM', 'SYNC')`),
  ],
);
