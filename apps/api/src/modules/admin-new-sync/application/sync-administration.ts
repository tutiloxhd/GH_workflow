import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import {
  executionExists,
  findCursor,
  listExecutions,
  listIssuesOfExecution,
  listSourceChanges,
  lockSourceChange,
  markSourceChangeReviewed,
  type PropertyChangeStatus,
} from '../persistence/sync-repository.js';
import { ADMIN_NEW_SOURCE_CODE } from './run-sync.js';

// La API solo consulta el estado del sincronizador y registra revisiones; nunca lo ejecuta.
export interface SyncAdministrationDependencies {
  readonly database: Database;
  readonly clock: Clock;
}

export type SyncAdministrationFailure =
  'SYNC_EXECUTION_NOT_FOUND' | 'SOURCE_CHANGE_NOT_FOUND' | 'SOURCE_CHANGE_NOT_REVIEWABLE';

const RECENT_EXECUTIONS = 20;

export async function getSyncStatus(dependencies: SyncAdministrationDependencies) {
  const { db } = dependencies.database;
  const [cursor, executions] = await Promise.all([
    findCursor(db, ADMIN_NEW_SOURCE_CODE),
    listExecutions(db, RECENT_EXECUTIONS),
  ]);
  return { cursor: cursor ?? null, executions };
}

export async function getExecutionIssues(
  dependencies: SyncAdministrationDependencies,
  executionId: number,
): Promise<Result<Awaited<ReturnType<typeof listIssuesOfExecution>>, SyncAdministrationFailure>> {
  const { db } = dependencies.database;
  if (!(await executionExists(db, executionId))) return fail('SYNC_EXECUTION_NOT_FOUND');
  return succeed(await listIssuesOfExecution(db, executionId));
}

export async function getSourceChanges(
  dependencies: SyncAdministrationDependencies,
  query: { status: PropertyChangeStatus | null; limit: number },
) {
  return listSourceChanges(dependencies.database.db, query);
}

// Un administrador marca como revisado un aviso de «ya no aceptada», después de decidir qué
// hacer con el workflow. Los cambios de fecha pendientes los procesa la reprogramación.
export async function reviewSourceChange(
  dependencies: SyncAdministrationDependencies,
  actorUserId: number,
  changeId: number,
): Promise<Result<{ changeId: number }, SyncAdministrationFailure>> {
  return dependencies.database.db.transaction(async (transaction) => {
    const change = await lockSourceChange(transaction, changeId);
    if (!change) return fail('SOURCE_CHANGE_NOT_FOUND');
    if (change.changeType !== 'NO_LONGER_ACCEPTED' || change.status !== 'PENDING') {
      return fail('SOURCE_CHANGE_NOT_REVIEWABLE');
    }
    await markSourceChangeReviewed(transaction, changeId, {
      processedAt: dependencies.clock.now(),
      processedBy: actorUserId,
    });
    return succeed({ changeId });
  });
}
