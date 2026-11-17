import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';
import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import { startWorkflow } from '../../workflow/application/start-workflow.js';
import { businessDayKey } from '../../workflow/domain/due-date.js';
import {
  REFERENCE_DATE_FIELDS,
  SYNTHETIC_ADMIN_NEW_ID_FLOOR,
  changedSnapshotFields,
  isReferenceDateField,
  normalizeSourceProperty,
  pickSnapshotValues,
  type NormalizedProperty,
  type PropertySnapshot,
  type SourceProperty,
} from '../domain/source-property.js';
import type { AdminNewSource } from '../persistence/admin-new-source.js';
import {
  ensureCursor,
  finishExecution,
  findLatestAcceptanceChanges,
  findTrackedProperties,
  insertPendingDateReprogramming,
  insertExecution,
  insertIssues,
  insertProperty,
  insertSourceChange,
  releaseCursor,
  tryAcquireCursor,
  updatePropertyFromSource,
  type ExecutionTotals,
  type IssueRecord,
  type PropertyChangeType,
  type SyncExecutionStatus,
  type TrackedProperty,
} from '../persistence/sync-repository.js';
import { applyPendingReprogrammings } from './apply-pending-reprogrammings.js';

export const ADMIN_NEW_SOURCE_CODE = 'ADMIN_NEW';
// Una ejecución que lleva más que esto marcada como en curso se considera abandonada.
const STALE_RUN_MINUTES = 15;
const MILLISECONDS_PER_MINUTE = 60_000;

export interface SyncDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly source: AdminNewSource;
}

export type SyncOutcome =
  | { readonly kind: 'SKIPPED_ALREADY_RUNNING' }
  | {
      readonly kind: 'COMPLETED';
      readonly executionId: number;
      readonly status: SyncExecutionStatus;
      readonly totals: ExecutionTotals;
    };

const isOpenWorkflow = (property: TrackedProperty) =>
  property.workflowStatus === 'ACTIVE' || property.workflowStatus === 'SUSPENDED';

const errorMessageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Una ejecución: lee las propiedades aceptadas de admin_new, las copia o actualiza, inicia el
// workflow de las nuevas y registra los cambios que requieren atención. Es idempotente: repetirla
// sin cambios en el origen no escribe nada salvo la ejecución misma.
export async function runAdminNewSync(dependencies: SyncDependencies): Promise<SyncOutcome> {
  const { db } = dependencies.database;
  const startedAt = dependencies.clock.now();

  await ensureCursor(db, ADMIN_NEW_SOURCE_CODE);
  const staleBefore = new Date(startedAt.getTime() - STALE_RUN_MINUTES * MILLISECONDS_PER_MINUTE);
  if (!(await tryAcquireCursor(db, ADMIN_NEW_SOURCE_CODE, startedAt, staleBefore))) {
    return { kind: 'SKIPPED_ALREADY_RUNNING' };
  }

  const executionId = await insertExecution(db, {
    sourceCode: ADMIN_NEW_SOURCE_CODE,
    startedAt,
  });
  const run = new SyncRun(dependencies);

  let status: SyncExecutionStatus;
  let errorMessage: string | null = null;
  let lastSourceId: number | null | undefined;
  try {
    lastSourceId = await run.execute();
    status = run.errorCount > 0 ? 'PARTIAL' : 'SUCCEEDED';
    if (status === 'PARTIAL') {
      errorMessage = `${String(run.errorCount)} propiedades no se pudieron procesar`;
    }
  } catch (error) {
    // Falla general (p. ej., admin_new no responde): no se procesó el lote completo.
    status = 'FAILED';
    errorMessage = errorMessageOf(error);
    run.reportError(null, 'SYNC_FAILED', errorMessage);
  }

  const completedAt = dependencies.clock.now();
  await insertIssues(db, executionId, run.issues);
  const totals = run.totals();
  await finishExecution(db, executionId, { ...totals, status, completedAt, errorMessage });
  await releaseCursor(db, ADMIN_NEW_SOURCE_CODE, {
    status: status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
    completedAt,
    lastError: errorMessage,
    ...(lastSourceId === undefined ? {} : { lastSourceId }),
  });
  return { kind: 'COMPLETED', executionId, status, totals };
}

class SyncRun {
  readonly issues: IssueRecord[] = [];
  private recordsRead = 0;
  private recordsCreated = 0;
  private recordsUpdated = 0;
  private workflowsStarted = 0;
  private warningCount = 0;
  errorCount = 0;

  private tracked = new Map<number, TrackedProperty>();
  private latestAcceptance = new Map<number, PropertyChangeType>();

  constructor(private readonly dependencies: SyncDependencies) {}

  private get db() {
    return this.dependencies.database.db;
  }

  totals(): ExecutionTotals {
    return {
      recordsRead: this.recordsRead,
      recordsCreated: this.recordsCreated,
      recordsUpdated: this.recordsUpdated,
      workflowsStarted: this.workflowsStarted,
      warningCount: this.warningCount,
      errorCount: this.errorCount,
    };
  }

  reportError(adminNewId: number | null, code: string, message: string): void {
    this.errorCount++;
    this.issues.push({ adminNewId, severity: 'ERROR', code, message });
  }

  private reportWarnings(adminNewId: number, normalized: NormalizedProperty): void {
    for (const issue of normalized.issues) {
      this.warningCount++;
      this.issues.push({ adminNewId, severity: 'WARNING', ...issue });
    }
  }

  // Devuelve el mayor id de origen leído, para el cursor.
  async execute(): Promise<number | null> {
    const accepted = await this.dependencies.source.readAcceptedProperties();
    this.recordsRead = accepted.length;
    this.tracked = new Map(
      (await findTrackedProperties(this.db)).map((property) => [property.adminNewId, property]),
    );
    this.latestAcceptance = await findLatestAcceptanceChanges(this.db);

    for (const source of accepted) {
      try {
        await this.processAccepted(source);
      } catch (error) {
        // Una propiedad con problemas no detiene el resto del lote.
        this.reportError(source.adminNewId, 'PROPERTY_FAILED', errorMessageOf(error));
      }
    }

    for (const failure of await applyPendingReprogrammings(this.dependencies)) {
      this.reportError(failure.adminNewId, 'REPROGRAMMING_FAILED', failure.message);
    }

    await this.detectNoLongerAccepted(new Set(accepted.map((source) => source.adminNewId)));
    return accepted.reduce<number | null>(
      (highest, source) => Math.max(highest ?? 0, source.adminNewId),
      null,
    );
  }

  private async processAccepted(source: SourceProperty): Promise<void> {
    const normalized = normalizeSourceProperty(source);
    const existing = this.tracked.get(source.adminNewId);
    if (!existing) {
      await this.createProperty(source.adminNewId, normalized);
      return;
    }

    let auctionAt = existing.auctionAt;
    if (existing.sourceHash !== normalized.sourceHash) {
      auctionAt = await this.applySourceChanges(existing, normalized);
    }
    if (this.latestAcceptance.get(existing.id) === 'NO_LONGER_ACCEPTED') {
      await insertSourceChange(this.db, {
        propertyId: existing.id,
        changeType: 'PROPERTY_ACCEPTED',
        status: 'PROCESSED',
        currentValues: { reaccepted: true },
        detectedAt: this.dependencies.clock.now(),
        processedAt: this.dependencies.clock.now(),
      });
    }
    // Una propiedad sin workflow lo recibe en cuanto es elegible (p. ej., se le asignó una fecha
    // de remate futura, o falló el inicio en una ejecución anterior).
    if (existing.workflowId === null) await this.startWorkflowIfEligible(existing.id, auctionAt);
  }

  private async createProperty(adminNewId: number, normalized: NormalizedProperty): Promise<void> {
    const now = this.dependencies.clock.now();
    let propertyId: number;
    try {
      propertyId = await insertProperty(this.db, {
        adminNewId,
        snapshot: normalized.snapshot,
        sourceHash: normalized.sourceHash,
        syncedAt: now,
      });
    } catch (error) {
      // Otro proceso la insertó entre la lectura y la inserción: la próxima ejecución la verá.
      if (isDuplicateEntryError(error)) return;
      throw error;
    }
    this.recordsCreated++;
    this.reportWarnings(adminNewId, normalized);

    const start = await this.startWorkflowIfEligible(propertyId, normalized.snapshot.auctionAt);
    await insertSourceChange(this.db, {
      propertyId,
      changeType: 'PROPERTY_ACCEPTED',
      status: start.workflowId === null ? 'IGNORED' : 'PROCESSED',
      currentValues: {
        ...pickSnapshotValues(normalized.snapshot, REFERENCE_DATE_FIELDS),
        workflowId: start.workflowId,
      },
      errorMessage: start.reason,
      detectedAt: now,
      processedAt: this.dependencies.clock.now(),
    });
  }

  // Aplica los valores nuevos. Las fechas de referencia de un workflow abierto no se sobrescriben:
  // quedan como cambio pendiente para la reprogramación (sprint 5), que recalcula los plazos.
  // Devuelve la fecha de remate vigente tras el cambio.
  private async applySourceChanges(
    existing: TrackedProperty,
    normalized: NormalizedProperty,
  ): Promise<Date | null> {
    const { snapshot } = normalized;
    const changedFields = changedSnapshotFields(existing, snapshot);
    const changedDates = changedFields.filter(isReferenceDateField);
    const changedData = changedFields.filter((field) => !isReferenceDateField(field));
    const deferDates = changedDates.length > 0 && isOpenWorkflow(existing);
    const now = this.dependencies.clock.now();

    const fieldsToWrite = deferDates ? changedData : changedFields;
    const values: Partial<Record<keyof PropertySnapshot, unknown>> = Object.fromEntries(
      fieldsToWrite.map((field) => [field, snapshot[field]]),
    );

    await this.db.transaction(async (transaction) => {
      await updatePropertyFromSource(transaction, existing.id, {
        ...(values as Partial<PropertySnapshot>),
        sourceHash: normalized.sourceHash,
        syncedAt: now,
      });
      if (changedDates.length > 0) {
        const sourceChangeId = await insertSourceChange(transaction, {
          propertyId: existing.id,
          changeType: 'AUCTION_DATE_CHANGED',
          status: deferDates ? 'PENDING' : 'PROCESSED',
          previousValues: pickSnapshotValues(existing, changedDates),
          currentValues: pickSnapshotValues(snapshot, changedDates),
          detectedAt: now,
          processedAt: deferDates ? null : now,
        });
        if (deferDates && existing.workflowId !== null) {
          await insertPendingDateReprogramming(transaction, {
            workflowId: existing.workflowId,
            sourceChangeId,
            previousAuctionAt: existing.auctionAt,
            newAuctionAt: snapshot.auctionAt,
            createdAt: now,
          });
        }
      }
      if (changedData.length > 0) {
        await insertSourceChange(transaction, {
          propertyId: existing.id,
          changeType: 'PROPERTY_DATA_CHANGED',
          status: 'PROCESSED',
          previousValues: pickSnapshotValues(existing, changedData),
          currentValues: pickSnapshotValues(snapshot, changedData),
          detectedAt: now,
          processedAt: now,
        });
      }
    });

    this.recordsUpdated++;
    this.reportWarnings(existing.adminNewId, normalized);
    return deferDates ? existing.auctionAt : snapshot.auctionAt;
  }

  // Regla provisoria (ADR 0007): se inicia el workflow si el remate es hoy o después, o si la
  // fecha se desconoce. Un remate ya ocurrido no abre un flujo con todas sus tareas vencidas;
  // el administrador puede iniciarlo a mano desde «Propiedades sin workflow».
  private async startWorkflowIfEligible(
    propertyId: number,
    auctionAt: Date | null,
  ): Promise<{ workflowId: number | null; reason: string | null }> {
    const today = businessDayKey(this.dependencies.clock.now());
    if (auctionAt && businessDayKey(auctionAt) < today) {
      return { workflowId: null, reason: 'El remate ya ocurrió; no se inicia el workflow' };
    }
    const outcome = await startWorkflow(this.dependencies, null, propertyId);
    if (!outcome.isSuccess) {
      throw new Error(`No se pudo iniciar el workflow: ${outcome.failure}`);
    }
    if (outcome.value.wasCreated) this.workflowsStarted++;
    return { workflowId: outcome.value.workflowId, reason: null };
  }

  // Propiedades copiadas que admin_new ya no muestra como aceptadas: se registra el cambio una
  // vez. Si tienen un workflow abierto queda pendiente; el workflow no se toca: un administrador
  // decide si suspenderlo, cancelarlo o continuar, y marca el cambio como revisado.
  private async detectNoLongerAccepted(acceptedIds: ReadonlySet<number>): Promise<void> {
    const candidates = [...this.tracked.values()].filter(
      (property) =>
        property.adminNewId < SYNTHETIC_ADMIN_NEW_ID_FLOOR &&
        !acceptedIds.has(property.adminNewId) &&
        this.latestAcceptance.get(property.id) !== 'NO_LONGER_ACCEPTED',
    );
    if (candidates.length === 0) return;

    const classifications = await this.dependencies.source.readClassifications(
      candidates.map((property) => property.adminNewId),
    );
    for (const property of candidates) {
      const existsInSource = classifications.has(property.adminNewId);
      const needsDecision = isOpenWorkflow(property);
      const now = this.dependencies.clock.now();
      await insertSourceChange(this.db, {
        propertyId: property.id,
        changeType: 'NO_LONGER_ACCEPTED',
        status: needsDecision ? 'PENDING' : 'PROCESSED',
        processedAt: needsDecision ? null : now,
        currentValues: {
          existsInSource,
          classificationId: classifications.get(property.adminNewId) ?? null,
          workflowId: property.workflowId,
        },
        detectedAt: now,
      });
    }
  }
}
