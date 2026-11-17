import { z } from 'zod';
import { succeed } from '../../../platform/result.js';
import { runWorkflowCommand } from '../../workflow/application/run-workflow-command.js';
import type { BusinessDates } from '../../workflow/domain/due-date.js';
import { updatePropertyBusinessDates } from '../../workflow/persistence/workflow-repository.js';
import {
  insertPendingDateReprogramming,
  listOrphanPendingDateChanges,
  listPendingDateReprogrammings,
  lockPendingDateReprogramming,
  markDateReprogrammingApplied,
  markSourceChangeProcessed,
  type PendingDateReprogramming,
} from '../persistence/sync-repository.js';
import type { SyncDependencies } from './run-sync.js';

const serializedDate = z
  .union([z.iso.datetime({ offset: true }), z.null()])
  .transform((value) => (value === null ? null : new Date(value)));

const businessDateChangesSchema = z
  .strictObject({
    auctionAt: serializedDate.optional(),
    guaranteePaymentAt: serializedDate.optional(),
    guaranteeReturnAt: serializedDate.optional(),
    balancePaymentAt: serializedDate.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'El cambio no contiene fechas de negocio');

const errorMessageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface ReprogrammingFailure {
  readonly adminNewId: number;
  readonly message: string;
}

// Los pendientes se consultan en cada ejecución: si el proceso cae después de detectar el cambio,
// la siguiente ejecución vuelve a intentar aplicarlo sin depender de un nuevo cambio en admin_new.
export async function applyPendingReprogrammings(
  dependencies: SyncDependencies,
): Promise<ReprogrammingFailure[]> {
  await materializeOrphanPendingChanges(dependencies);
  const pending = await listPendingDateReprogrammings(dependencies.database.db);
  const failures: ReprogrammingFailure[] = [];

  for (const reprogramming of pending) {
    try {
      await applyPendingReprogramming(dependencies, reprogramming);
    } catch (error) {
      failures.push({
        adminNewId: reprogramming.adminNewId,
        message: errorMessageOf(error),
      });
    }
  }
  return failures;
}

async function materializeOrphanPendingChanges(dependencies: SyncDependencies): Promise<void> {
  const orphanChanges = await listOrphanPendingDateChanges(dependencies.database.db);
  for (const change of orphanChanges) {
    await insertPendingDateReprogramming(dependencies.database.db, {
      workflowId: change.workflowId,
      sourceChangeId: change.sourceChangeId,
      previousAuctionAt: auctionAtFrom(change.previousValues),
      newAuctionAt: auctionAtFrom(change.currentValues),
      createdAt: change.detectedAt,
    });
  }
}

function auctionAtFrom(values: unknown): Date | null {
  const parsed = z.object({ auctionAt: serializedDate.optional() }).safeParse(values);
  return parsed.success ? (parsed.data.auctionAt ?? null) : null;
}

async function applyPendingReprogramming(
  dependencies: SyncDependencies,
  reprogramming: PendingDateReprogramming,
): Promise<void> {
  const parsed = businessDateChangesSchema.safeParse(reprogramming.currentValues);
  if (!parsed.success) {
    throw new Error(`Fechas inválidas en el cambio ${String(reprogramming.sourceChangeId)}`);
  }
  const dates = Object.fromEntries(
    Object.entries(parsed.data).filter(
      (entry): entry is [string, Date | null] => entry[1] !== undefined,
    ),
  ) as Partial<BusinessDates>;

  const outcome = await runWorkflowCommand(
    dependencies,
    reprogramming.workflowId,
    null,
    async (context) => {
      const locked = await lockPendingDateReprogramming(context.executor, reprogramming.id);
      if (!locked) throw new Error('La reprogramación pendiente no existe');
      if (locked.status !== 'PENDING') return succeed(undefined);

      const previousDates = context.businessDates;
      await updatePropertyBusinessDates(context.executor, context.workflow.propertyId, dates);
      context.setBusinessDates(dates);
      await context.recalculateOpenDeadlines(context.now);
      await markSourceChangeProcessed(context.executor, reprogramming.sourceChangeId, context.now);
      await markDateReprogrammingApplied(context.executor, reprogramming.id, {
        previousAuctionAt: previousDates.auctionAt,
        newAuctionAt: context.businessDates.auctionAt,
        appliedAt: context.now,
      });
      context.record({
        eventType: 'WORKFLOW_REPROGRAMMED',
        details: {
          trigger: 'ADMIN_NEW_SYNC',
          sourceChangeId: reprogramming.sourceChangeId,
          previousDates: serializeDates(previousDates, dates),
          newDates: serializeDates(context.businessDates, dates),
        },
      });
      return succeed(undefined);
    },
    'SYNC',
  );

  if (!outcome.isSuccess) throw new Error(`No se pudo reprogramar: ${outcome.failure}`);
}

function serializeDates(
  dates: BusinessDates,
  changedDates: Partial<BusinessDates>,
): Partial<Record<keyof BusinessDates, string | null>> {
  return Object.fromEntries(
    (Object.keys(changedDates) as (keyof BusinessDates)[]).map((field) => [
      field,
      dates[field]?.toISOString() ?? null,
    ]),
  );
}
