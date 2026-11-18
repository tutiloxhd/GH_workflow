import { sql } from 'drizzle-orm';
import {
  char,
  check,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  text,
  time,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { createdAt, primaryId, referenceId, updatedAt, utcDateTime } from './columns.js';
import { users } from './identity.schema.js';

export const SYNC_CURSOR_STATUSES = ['NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export const SYNC_EXECUTION_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const;
export const PROPERTY_CHANGE_TYPES = [
  'PROPERTY_ACCEPTED',
  'AUCTION_DATE_CHANGED',
  'PROPERTY_DATA_CHANGED',
  'NO_LONGER_ACCEPTED',
] as const;
export const PROPERTY_CHANGE_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'IGNORED',
] as const;

// Copia operacional de los datos de admin_new necesarios para ejecutar el workflow.
export const properties = mysqlTable(
  'properties',
  {
    id: primaryId(),
    adminNewId: referenceId('admin_new_id').notNull(),
    title: varchar('title', { length: 255 }),
    address: varchar('address', { length: 255 }),
    commune: varchar('commune', { length: 100 }),
    region: varchar('region', { length: 100 }),
    court: varchar('court', { length: 150 }),
    tribunal: varchar('tribunal', { length: 150 }),
    caseReference: varchar('case_reference', { length: 100 }),
    auctionBidderName: text('auction_bidder_name'),
    auctionPayerName: text('auction_payer_name'),
    auctionAt: utcDateTime('auction_at'),
    guaranteeAmount: decimal('guarantee_amount', { precision: 18, scale: 2 }),
    guaranteePaymentAt: utcDateTime('guarantee_payment_at'),
    guaranteeWindowStart: time('guarantee_window_start'),
    guaranteeWindowEnd: time('guarantee_window_end'),
    guaranteeReturnAt: utcDateTime('guarantee_return_at'),
    balancePaymentAt: utcDateTime('balance_payment_at'),
    sourceUpdatedAt: utcDateTime('source_updated_at'),
    // SHA-256 de los valores de origen: permite detectar cambios sin alterar admin_new.
    sourceHash: char('source_hash', { length: 64 }),
    lastSyncedAt: utcDateTime('last_synced_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_properties_admin_new_id').on(table.adminNewId),
    index('idx_properties_auction_at').on(table.auctionAt),
    check(
      'chk_properties_guarantee_amount',
      sql`${table.guaranteeAmount} IS NULL OR ${table.guaranteeAmount} >= 0`,
    ),
  ],
);

export const syncCursors = mysqlTable(
  'sync_cursors',
  {
    id: primaryId(),
    sourceCode: varchar('source_code', { length: 50 }).notNull(),
    lastSourceUpdatedAt: utcDateTime('last_source_updated_at'),
    lastSourceId: referenceId('last_source_id'),
    lastStartedAt: utcDateTime('last_started_at'),
    lastCompletedAt: utcDateTime('last_completed_at'),
    lastStatus: varchar('last_status', { length: 20, enum: SYNC_CURSOR_STATUSES })
      .notNull()
      .default('NEVER_RUN'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_sync_cursors_source').on(table.sourceCode),
    check(
      'chk_sync_cursors_status',
      sql`${table.lastStatus} IN ('NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED')`,
    ),
  ],
);

export const syncExecutions = mysqlTable(
  'sync_executions',
  {
    id: primaryId(),
    sourceCode: varchar('source_code', { length: 50 }).notNull(),
    status: varchar('status', { length: 20, enum: SYNC_EXECUTION_STATUSES }).notNull(),
    startedAt: utcDateTime('started_at').notNull(),
    completedAt: utcDateTime('completed_at'),
    recordsRead: int('records_read', { unsigned: true }).notNull().default(0),
    recordsCreated: int('records_created', { unsigned: true }).notNull().default(0),
    recordsUpdated: int('records_updated', { unsigned: true }).notNull().default(0),
    workflowsStarted: int('workflows_started', { unsigned: true }).notNull().default(0),
    warningCount: int('warning_count', { unsigned: true }).notNull().default(0),
    errorCount: int('error_count', { unsigned: true }).notNull().default(0),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('idx_sync_executions_source_started').on(table.sourceCode, table.startedAt),
    check(
      'chk_sync_executions_status',
      sql`${table.status} IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')`,
    ),
  ],
);

export const SYNC_ISSUE_SEVERITIES = ['WARNING', 'ERROR'] as const;

// Advertencias y errores de una ejecución: valores de origen inválidos, filas duplicadas, fallos
// por propiedad. Se registran solo cuando la propiedad se procesa (nueva o con cambios), no en
// cada ejecución, para no repetir el mismo aviso cada minuto.
export const syncIssues = mysqlTable(
  'sync_issues',
  {
    id: primaryId(),
    syncExecutionId: referenceId('sync_execution_id').notNull(),
    adminNewId: referenceId('admin_new_id'),
    severity: varchar('severity', { length: 10, enum: SYNC_ISSUE_SEVERITIES }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    message: varchar('message', { length: 500 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('idx_sync_issues_execution').on(table.syncExecutionId),
    foreignKey({
      name: 'fk_sync_issues_execution',
      columns: [table.syncExecutionId],
      foreignColumns: [syncExecutions.id],
    }),
    check('chk_sync_issues_severity', sql`${table.severity} IN ('WARNING', 'ERROR')`),
  ],
);

export const propertySourceChanges = mysqlTable(
  'property_source_changes',
  {
    id: primaryId(),
    propertyId: referenceId('property_id').notNull(),
    changeType: varchar('change_type', { length: 50, enum: PROPERTY_CHANGE_TYPES }).notNull(),
    previousValues: json('previous_values'),
    currentValues: json('current_values'),
    status: varchar('status', { length: 20, enum: PROPERTY_CHANGE_STATUSES })
      .notNull()
      .default('PENDING'),
    errorMessage: text('error_message'),
    detectedAt: createdAt('detected_at'),
    processedAt: utcDateTime('processed_at'),
    // Administrador que revisó un cambio pendiente; null si lo procesó el sincronizador.
    processedBy: referenceId('processed_by'),
  },
  (table) => [
    index('idx_property_changes_property').on(table.propertyId, table.detectedAt),
    index('idx_property_changes_status').on(table.status, table.detectedAt),
    foreignKey({
      name: 'fk_property_changes_property',
      columns: [table.propertyId],
      foreignColumns: [properties.id],
    }),
    foreignKey({
      name: 'fk_property_changes_processed_by',
      columns: [table.processedBy],
      foreignColumns: [users.id],
    }),
    check(
      'chk_property_changes_type',
      sql`${table.changeType} IN ('PROPERTY_ACCEPTED', 'AUCTION_DATE_CHANGED', 'PROPERTY_DATA_CHANGED', 'NO_LONGER_ACCEPTED')`,
    ),
    check(
      'chk_property_changes_status',
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED')`,
    ),
  ],
);
