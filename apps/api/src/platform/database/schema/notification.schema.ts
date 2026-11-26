import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { createdAt, primaryId, referenceId, updatedAt, utcDateTime } from './columns.js';
import { users } from './identity.schema.js';
import {
  taskInstances,
  workflowEvents,
  workflowInstances,
  workflowTemplates,
} from './workflow.schema.js';

export const NOTIFICATION_TRIGGERS = [
  'TASK_ASSIGNED',
  'TASK_REMINDER',
  'TASK_ESCALATION',
  'TASK_OVERDUE',
  'TASK_COMPLETED',
  'WORKFLOW_SUSPENDED',
  'WORKFLOW_RESUMED',
  'WORKFLOW_CANCELLED',
  'WORKFLOW_REPROGRAMMED',
] as const;
export type NotificationTrigger = (typeof NOTIFICATION_TRIGGERS)[number];

export const notificationRuleSets = mysqlTable(
  'notification_rule_sets',
  {
    id: primaryId(),
    workflowTemplateId: referenceId('workflow_template_id').notNull(),
    version: int('version', { unsigned: true }).notNull(),
    isPublished: int('is_published', { unsigned: true }).notNull().default(0),
    createdBy: referenceId('created_by'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_notification_rule_sets_template_version').on(
      table.workflowTemplateId,
      table.version,
    ),
    foreignKey({
      name: 'fk_notification_rule_sets_template',
      columns: [table.workflowTemplateId],
      foreignColumns: [workflowTemplates.id],
    }),
    foreignKey({
      name: 'fk_notification_rule_sets_creator',
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }),
    check('chk_notification_rule_sets_published', sql`${table.isPublished} IN (0, 1)`),
  ],
);

export const notificationRules = mysqlTable(
  'notification_rules',
  {
    id: primaryId(),
    ruleSetId: referenceId('rule_set_id').notNull(),
    trigger: varchar('event_type', { length: 40, enum: NOTIFICATION_TRIGGERS }).notNull(),
    offsetMinutes: int('offset_minutes').notNull().default(0),
    isEnabled: int('is_enabled', { unsigned: true }).notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_notification_rules_set_trigger').on(table.ruleSetId, table.trigger),
    foreignKey({
      name: 'fk_notification_rules_set',
      columns: [table.ruleSetId],
      foreignColumns: [notificationRuleSets.id],
    }),
    check(
      'chk_notification_rules_trigger',
      sql`${table.trigger} IN ('TASK_ASSIGNED', 'TASK_REMINDER', 'TASK_ESCALATION', 'TASK_OVERDUE', 'TASK_COMPLETED', 'WORKFLOW_SUSPENDED', 'WORKFLOW_RESUMED', 'WORKFLOW_CANCELLED', 'WORKFLOW_REPROGRAMMED')`,
    ),
    check('chk_notification_rules_enabled', sql`${table.isEnabled} IN (0, 1)`),
  ],
);

export const workflowNotificationRuleSets = mysqlTable(
  'workflow_notification_rule_sets',
  {
    workflowInstanceId: referenceId('workflow_instance_id').primaryKey(),
    ruleSetId: referenceId('rule_set_id').notNull(),
    assignedAt: createdAt('assigned_at'),
  },
  (table) => [
    foreignKey({
      name: 'fk_workflow_notification_rules_workflow',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_workflow_notification_rules_set',
      columns: [table.ruleSetId],
      foreignColumns: [notificationRuleSets.id],
    }),
  ],
);

export const notificationOutbox = mysqlTable(
  'notification_outbox',
  {
    id: primaryId(),
    workflowEventId: referenceId('workflow_event_id').notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    taskInstanceId: referenceId('task_instance_id'),
    payload: json('payload'),
    availableAt: utcDateTime('available_at').notNull(),
    processedAt: utcDateTime('processed_at'),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedUntil: utcDateTime('locked_until'),
    attempts: int('attempts', { unsigned: true }).notNull().default(0),
    lastError: varchar('last_error', { length: 500 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_notification_outbox_event').on(table.workflowEventId),
    index('idx_notification_outbox_pending').on(table.processedAt, table.availableAt),
    index('idx_notification_outbox_lease').on(table.lockedUntil),
    foreignKey({
      name: 'fk_notification_outbox_event',
      columns: [table.workflowEventId],
      foreignColumns: [workflowEvents.id],
    }),
    foreignKey({
      name: 'fk_notification_outbox_workflow',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_notification_outbox_task',
      columns: [table.taskInstanceId],
      foreignColumns: [taskInstances.id],
    }),
  ],
);

export const notifications = mysqlTable(
  'notifications',
  {
    id: primaryId(),
    userId: referenceId('user_id').notNull(),
    trigger: varchar('event_type', { length: 40, enum: NOTIFICATION_TRIGGERS }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    workflowInstanceId: referenceId('workflow_instance_id').notNull(),
    taskInstanceId: referenceId('task_instance_id'),
    deduplicationKey: varchar('deduplication_key', { length: 190 }).notNull(),
    readAt: utcDateTime('read_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_notifications_deduplication').on(table.deduplicationKey),
    index('idx_notifications_user').on(table.userId, table.readAt, table.createdAt),
    index('idx_notifications_task').on(table.taskInstanceId),
    foreignKey({
      name: 'fk_notifications_user',
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'fk_notifications_workflow',
      columns: [table.workflowInstanceId],
      foreignColumns: [workflowInstances.id],
    }),
    foreignKey({
      name: 'fk_notifications_task',
      columns: [table.taskInstanceId],
      foreignColumns: [taskInstances.id],
    }),
  ],
);

export const pushSubscriptions = mysqlTable(
  'push_subscriptions',
  {
    id: primaryId(),
    userId: referenceId('user_id').notNull(),
    endpoint: varchar('endpoint', { length: 2048 }).notNull(),
    endpointHash: varchar('endpoint_hash', { length: 64 }).notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 255 }).notNull(),
    revokedAt: utcDateTime('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_push_subscriptions_endpoint_hash').on(table.endpointHash),
    index('idx_push_subscriptions_user').on(table.userId, table.revokedAt),
    foreignKey({
      name: 'fk_push_subscriptions_user',
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
  ],
);

export const PUSH_DELIVERY_STATUSES = [
  'PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED',
] as const;

export const pushDeliveries = mysqlTable(
  'push_deliveries',
  {
    id: primaryId(),
    notificationId: referenceId('notification_id').notNull(),
    subscriptionId: referenceId('subscription_id').notNull(),
    status: varchar('status', { length: 20, enum: PUSH_DELIVERY_STATUSES })
      .notNull().default('PENDING'),
    availableAt: utcDateTime('available_at').notNull().default(sql`CURRENT_TIMESTAMP(6)`),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedUntil: utcDateTime('locked_until'),
    attempts: int('attempts', { unsigned: true }).notNull().default(0),
    lastError: varchar('last_error', { length: 100 }),
    completedAt: utcDateTime('completed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('uq_push_deliveries_notification_subscription').on(
      table.notificationId, table.subscriptionId,
    ),
    index('idx_push_deliveries_due').on(table.status, table.availableAt),
    index('idx_push_deliveries_lease').on(table.lockedUntil),
    foreignKey({ name: 'fk_push_deliveries_notification', columns: [table.notificationId], foreignColumns: [notifications.id] }),
    foreignKey({ name: 'fk_push_deliveries_subscription', columns: [table.subscriptionId], foreignColumns: [pushSubscriptions.id] }),
    check('chk_push_deliveries_status', sql`${table.status} IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED')`),
  ],
);

export const NOTIFICATION_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;

export const notificationJobs = mysqlTable(
  'notification_jobs',
  {
    id: primaryId(),
    taskInstanceId: referenceId('task_instance_id').notNull(),
    userId: referenceId('user_id').notNull(),
    trigger: varchar('event_type', { length: 40, enum: NOTIFICATION_TRIGGERS }).notNull(),
    occurrenceKey: varchar('occurrence_key', { length: 190 }).notNull(),
    scheduledAt: utcDateTime('scheduled_at').notNull(),
    status: varchar('status', { length: 20, enum: NOTIFICATION_JOB_STATUSES })
      .notNull()
      .default('PENDING'),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedUntil: utcDateTime('locked_until'),
    attempts: int('attempts', { unsigned: true }).notNull().default(0),
    lastError: varchar('last_error', { length: 500 }),
    completedAt: utcDateTime('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_notification_jobs_occurrence').on(table.occurrenceKey),
    index('idx_notification_jobs_due').on(table.status, table.scheduledAt),
    index('idx_notification_jobs_task').on(table.taskInstanceId, table.status),
    foreignKey({
      name: 'fk_notification_jobs_task',
      columns: [table.taskInstanceId],
      foreignColumns: [taskInstances.id],
    }),
    foreignKey({
      name: 'fk_notification_jobs_user',
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
    check(
      'chk_notification_jobs_status',
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    ),
  ],
);
