import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import {
  properties,
  propertySourceChanges,
  syncCursors,
  syncExecutions,
  syncIssues,
  type PROPERTY_CHANGE_STATUSES,
  type PROPERTY_CHANGE_TYPES,
  type SYNC_EXECUTION_STATUSES,
  type SYNC_ISSUE_SEVERITIES,
} from '../../../platform/database/schema/admin-new-sync.schema.js';
import {
  workflowInstances,
  workflowReprogrammings,
} from '../../../platform/database/schema/workflow.schema.js';
import type { WorkflowStatus } from '../../workflow/domain/statuses.js';
import type { PropertySnapshot } from '../domain/source-property.js';

export type SyncExecutionStatus = (typeof SYNC_EXECUTION_STATUSES)[number];
export type SyncIssueSeverity = (typeof SYNC_ISSUE_SEVERITIES)[number];
export type PropertyChangeType = (typeof PROPERTY_CHANGE_TYPES)[number];
export type PropertyChangeStatus = (typeof PROPERTY_CHANGE_STATUSES)[number];

// ───────────── Cursor (uno por fuente; hace de candado entre procesos) ─────────────

export async function ensureCursor(executor: DatabaseExecutor, sourceCode: string): Promise<void> {
  await executor
    .insert(syncCursors)
    .values({ sourceCode })
    .onDuplicateKeyUpdate({ set: { sourceCode } });
}

// Toma el cursor si nadie lo tiene, o si quien lo tomó lleva más de `staleBefore` sin terminar
// (un proceso que murió a mitad de camino). El UPDATE condicional es atómico en MySQL.
export async function tryAcquireCursor(
  executor: DatabaseExecutor,
  sourceCode: string,
  now: Date,
  staleBefore: Date,
): Promise<boolean> {
  const [result] = await executor
    .update(syncCursors)
    .set({ lastStatus: 'RUNNING', lastStartedAt: now })
    .where(
      and(
        eq(syncCursors.sourceCode, sourceCode),
        or(
          ne(syncCursors.lastStatus, 'RUNNING'),
          isNull(syncCursors.lastStartedAt),
          lt(syncCursors.lastStartedAt, staleBefore),
        ),
      ),
    );
  return result.affectedRows === 1;
}

export async function releaseCursor(
  executor: DatabaseExecutor,
  sourceCode: string,
  outcome: {
    status: 'SUCCEEDED' | 'FAILED';
    completedAt: Date;
    lastError: string | null;
    lastSourceId?: number | null;
  },
): Promise<void> {
  await executor
    .update(syncCursors)
    .set({
      lastStatus: outcome.status,
      lastCompletedAt: outcome.completedAt,
      lastError: outcome.lastError,
      ...(outcome.lastSourceId === undefined ? {} : { lastSourceId: outcome.lastSourceId }),
    })
    .where(eq(syncCursors.sourceCode, sourceCode));
}

export async function findCursor(executor: DatabaseExecutor, sourceCode: string) {
  const [cursor] = await executor
    .select({
      lastStatus: syncCursors.lastStatus,
      lastStartedAt: syncCursors.lastStartedAt,
      lastCompletedAt: syncCursors.lastCompletedAt,
      lastSourceId: syncCursors.lastSourceId,
      lastError: syncCursors.lastError,
    })
    .from(syncCursors)
    .where(eq(syncCursors.sourceCode, sourceCode));
  return cursor;
}

// ───────────── Ejecuciones e incidencias ─────────────

export async function insertExecution(
  executor: DatabaseExecutor,
  execution: { sourceCode: string; startedAt: Date },
): Promise<number> {
  const [inserted] = await executor
    .insert(syncExecutions)
    .values({ ...execution, status: 'RUNNING' })
    .$returningId();
  if (!inserted) throw new Error('La inserción de la ejecución no devolvió identificador');
  return inserted.id;
}

export interface ExecutionTotals {
  readonly recordsRead: number;
  readonly recordsCreated: number;
  readonly recordsUpdated: number;
  readonly workflowsStarted: number;
  readonly warningCount: number;
  readonly errorCount: number;
}

export async function finishExecution(
  executor: DatabaseExecutor,
  executionId: number,
  outcome: ExecutionTotals & {
    status: SyncExecutionStatus;
    completedAt: Date;
    errorMessage: string | null;
  },
): Promise<void> {
  await executor.update(syncExecutions).set(outcome).where(eq(syncExecutions.id, executionId));
}

export interface IssueRecord {
  readonly adminNewId: number | null;
  readonly severity: SyncIssueSeverity;
  readonly code: string;
  readonly message: string;
}

const MAX_ISSUE_MESSAGE_LENGTH = 500;

export async function insertIssues(
  executor: DatabaseExecutor,
  executionId: number,
  issues: readonly IssueRecord[],
): Promise<void> {
  if (issues.length === 0) return;
  await executor.insert(syncIssues).values(
    issues.map((issue) => ({
      ...issue,
      message: issue.message.slice(0, MAX_ISSUE_MESSAGE_LENGTH),
      syncExecutionId: executionId,
    })),
  );
}

export async function listExecutions(executor: DatabaseExecutor, limit: number) {
  return executor
    .select({
      id: syncExecutions.id,
      status: syncExecutions.status,
      startedAt: syncExecutions.startedAt,
      completedAt: syncExecutions.completedAt,
      recordsRead: syncExecutions.recordsRead,
      recordsCreated: syncExecutions.recordsCreated,
      recordsUpdated: syncExecutions.recordsUpdated,
      workflowsStarted: syncExecutions.workflowsStarted,
      warningCount: syncExecutions.warningCount,
      errorCount: syncExecutions.errorCount,
      errorMessage: syncExecutions.errorMessage,
    })
    .from(syncExecutions)
    .orderBy(desc(syncExecutions.id))
    .limit(limit);
}

export async function executionExists(
  executor: DatabaseExecutor,
  executionId: number,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: syncExecutions.id })
    .from(syncExecutions)
    .where(eq(syncExecutions.id, executionId));
  return row !== undefined;
}

export async function listIssuesOfExecution(executor: DatabaseExecutor, executionId: number) {
  return executor
    .select({
      id: syncIssues.id,
      adminNewId: syncIssues.adminNewId,
      severity: syncIssues.severity,
      code: syncIssues.code,
      message: syncIssues.message,
    })
    .from(syncIssues)
    .where(eq(syncIssues.syncExecutionId, executionId))
    .orderBy(syncIssues.id);
}

// ───────────── Propiedades ─────────────

export interface TrackedProperty extends PropertySnapshot {
  readonly id: number;
  readonly adminNewId: number;
  readonly sourceHash: string | null;
  readonly workflowId: number | null;
  readonly workflowStatus: WorkflowStatus | null;
}

const snapshotColumns = {
  title: properties.title,
  address: properties.address,
  commune: properties.commune,
  region: properties.region,
  court: properties.court,
  tribunal: properties.tribunal,
  caseReference: properties.caseReference,
  auctionAt: properties.auctionAt,
  guaranteeAmount: properties.guaranteeAmount,
  guaranteePaymentAt: properties.guaranteePaymentAt,
  guaranteeWindowStart: properties.guaranteeWindowStart,
  guaranteeWindowEnd: properties.guaranteeWindowEnd,
  guaranteeReturnAt: properties.guaranteeReturnAt,
  balancePaymentAt: properties.balancePaymentAt,
};

export async function findTrackedProperties(
  executor: DatabaseExecutor,
): Promise<TrackedProperty[]> {
  return executor
    .select({
      id: properties.id,
      adminNewId: properties.adminNewId,
      sourceHash: properties.sourceHash,
      ...snapshotColumns,
      workflowId: workflowInstances.id,
      workflowStatus: workflowInstances.status,
    })
    .from(properties)
    .leftJoin(workflowInstances, eq(workflowInstances.propertyId, properties.id));
}

export async function insertProperty(
  executor: DatabaseExecutor,
  property: { adminNewId: number; snapshot: PropertySnapshot; sourceHash: string; syncedAt: Date },
): Promise<number> {
  const [inserted] = await executor
    .insert(properties)
    .values({
      adminNewId: property.adminNewId,
      ...property.snapshot,
      sourceHash: property.sourceHash,
      lastSyncedAt: property.syncedAt,
    })
    .$returningId();
  if (!inserted) throw new Error('La inserción de la propiedad no devolvió identificador');
  return inserted.id;
}

export async function updatePropertyFromSource(
  executor: DatabaseExecutor,
  propertyId: number,
  changes: Partial<PropertySnapshot> & { sourceHash: string; syncedAt: Date },
): Promise<void> {
  const { syncedAt, ...values } = changes;
  await executor
    .update(properties)
    .set({ ...values, lastSyncedAt: syncedAt })
    .where(eq(properties.id, propertyId));
}

// ───────────── Cambios de origen ─────────────

export async function insertSourceChange(
  executor: DatabaseExecutor,
  change: {
    propertyId: number;
    changeType: PropertyChangeType;
    status: PropertyChangeStatus;
    previousValues?: unknown;
    currentValues?: unknown;
    errorMessage?: string | null;
    detectedAt: Date;
    processedAt?: Date | null;
  },
): Promise<number> {
  const [inserted] = await executor.insert(propertySourceChanges).values(change).$returningId();
  if (!inserted) throw new Error('La inserción del cambio de origen no devolvió identificador');
  return inserted.id;
}

export interface PendingDateReprogramming {
  readonly id: number;
  readonly workflowId: number;
  readonly sourceChangeId: number;
  readonly adminNewId: number;
  readonly currentValues: unknown;
}

export async function insertPendingDateReprogramming(
  executor: DatabaseExecutor,
  reprogramming: {
    workflowId: number;
    sourceChangeId: number;
    previousAuctionAt: Date | null;
    newAuctionAt: Date | null;
    createdAt: Date;
  },
): Promise<void> {
  await executor.insert(workflowReprogrammings).values({
    workflowInstanceId: reprogramming.workflowId,
    sourceChangeId: reprogramming.sourceChangeId,
    previousAuctionAt: reprogramming.previousAuctionAt,
    newAuctionAt: reprogramming.newAuctionAt,
    origin: 'SYNC',
    status: 'PENDING',
    createdAt: reprogramming.createdAt,
  });
}

export async function listPendingDateReprogrammings(
  executor: DatabaseExecutor,
): Promise<PendingDateReprogramming[]> {
  return executor
    .select({
      id: workflowReprogrammings.id,
      workflowId: workflowReprogrammings.workflowInstanceId,
      sourceChangeId: propertySourceChanges.id,
      adminNewId: properties.adminNewId,
      currentValues: propertySourceChanges.currentValues,
    })
    .from(workflowReprogrammings)
    .innerJoin(
      propertySourceChanges,
      eq(propertySourceChanges.id, workflowReprogrammings.sourceChangeId),
    )
    .innerJoin(properties, eq(properties.id, propertySourceChanges.propertyId))
    .where(eq(workflowReprogrammings.status, 'PENDING'))
    .orderBy(workflowReprogrammings.id);
}

export async function lockPendingDateReprogramming(
  executor: DatabaseExecutor,
  reprogrammingId: number,
) {
  const [reprogramming] = await executor
    .select({ id: workflowReprogrammings.id, status: workflowReprogrammings.status })
    .from(workflowReprogrammings)
    .where(eq(workflowReprogrammings.id, reprogrammingId))
    .for('update');
  return reprogramming;
}

export async function markDateReprogrammingApplied(
  executor: DatabaseExecutor,
  reprogrammingId: number,
  appliedAt: Date,
): Promise<void> {
  await executor
    .update(workflowReprogrammings)
    .set({ status: 'APPLIED', appliedAt, errorMessage: null })
    .where(eq(workflowReprogrammings.id, reprogrammingId));
}

export async function markSourceChangeProcessed(
  executor: DatabaseExecutor,
  sourceChangeId: number,
  processedAt: Date,
): Promise<void> {
  await executor
    .update(propertySourceChanges)
    .set({ status: 'PROCESSED', processedAt, errorMessage: null })
    .where(eq(propertySourceChanges.id, sourceChangeId));
}

export async function lockSourceChange(executor: DatabaseExecutor, changeId: number) {
  const [change] = await executor
    .select({
      id: propertySourceChanges.id,
      changeType: propertySourceChanges.changeType,
      status: propertySourceChanges.status,
    })
    .from(propertySourceChanges)
    .where(eq(propertySourceChanges.id, changeId))
    .for('update');
  return change;
}

export async function markSourceChangeReviewed(
  executor: DatabaseExecutor,
  changeId: number,
  review: { processedAt: Date; processedBy: number },
): Promise<void> {
  await executor
    .update(propertySourceChanges)
    .set({ status: 'PROCESSED', ...review })
    .where(eq(propertySourceChanges.id, changeId));
}

// Último cambio de aceptación (aceptada / ya no aceptada) de cada propiedad, para no repetirlo.
export async function findLatestAcceptanceChanges(
  executor: DatabaseExecutor,
): Promise<Map<number, PropertyChangeType>> {
  const latestIds = executor
    .select({ id: sql<number>`MAX(${propertySourceChanges.id})`.as('latest_id') })
    .from(propertySourceChanges)
    .where(inArray(propertySourceChanges.changeType, ['PROPERTY_ACCEPTED', 'NO_LONGER_ACCEPTED']))
    .groupBy(propertySourceChanges.propertyId)
    .as('latest');
  const rows = await executor
    .select({
      propertyId: propertySourceChanges.propertyId,
      changeType: propertySourceChanges.changeType,
    })
    .from(propertySourceChanges)
    .innerJoin(latestIds, eq(latestIds.id, propertySourceChanges.id));
  return new Map(rows.map((row) => [row.propertyId, row.changeType]));
}

export async function listSourceChanges(
  executor: DatabaseExecutor,
  query: { status: PropertyChangeStatus | null; limit: number },
) {
  return executor
    .select({
      id: propertySourceChanges.id,
      propertyId: propertySourceChanges.propertyId,
      adminNewId: properties.adminNewId,
      propertyTitle: properties.title,
      workflowId: workflowInstances.id,
      changeType: propertySourceChanges.changeType,
      status: propertySourceChanges.status,
      previousValues: propertySourceChanges.previousValues,
      currentValues: propertySourceChanges.currentValues,
      errorMessage: propertySourceChanges.errorMessage,
      detectedAt: propertySourceChanges.detectedAt,
      processedAt: propertySourceChanges.processedAt,
      processedBy: propertySourceChanges.processedBy,
    })
    .from(propertySourceChanges)
    .innerJoin(properties, eq(properties.id, propertySourceChanges.propertyId))
    .leftJoin(workflowInstances, eq(workflowInstances.propertyId, properties.id))
    .where(query.status === null ? undefined : eq(propertySourceChanges.status, query.status))
    .orderBy(desc(propertySourceChanges.id))
    .limit(query.limit);
}
