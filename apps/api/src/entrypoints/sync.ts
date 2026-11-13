// Sincronizador con admin_new: proceso separado del servidor HTTP.
//   npm run sync          → corre cada SYNC_INTERVAL_SECONDS hasta recibir SIGINT/SIGTERM
//   npm run sync -- --once → una sola ejecución (útil para probar o para un cron externo)
import { toAdminNewDatabaseSettings, toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import {
  runAdminNewSync,
  type SyncDependencies,
} from '../modules/admin-new-sync/application/run-sync.js';
import { connectAdminNewSource } from '../modules/admin-new-sync/persistence/admin-new-source.js';
import { systemClock } from '../platform/clock/clock.js';
import { connectDatabase } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

const MILLISECONDS_PER_SECOND = 1000;

async function runOnce(dependencies: SyncDependencies): Promise<void> {
  try {
    const outcome = await runAdminNewSync(dependencies);
    if (outcome.kind === 'SKIPPED_ALREADY_RUNNING') {
      logger.info('sync.skipped', { reason: 'already_running' });
      return;
    }
    logger.info('sync.completed', {
      executionId: outcome.executionId,
      status: outcome.status,
      ...outcome.totals,
    });
  } catch (error) {
    // Sin acceso a la base del workflow ni siquiera se puede registrar la ejecución.
    logger.error('sync.failed', error);
  }
}

async function run(): Promise<void> {
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  const source = connectAdminNewSource(toAdminNewDatabaseSettings(env));
  const dependencies: SyncDependencies = { database, clock: systemClock, source };

  const closeConnections = async () => {
    await Promise.allSettled([source.close(), database.close()]);
  };

  if (process.argv.includes('--once')) {
    await runOnce(dependencies);
    await closeConnections();
    return;
  }

  let isStopping = false;
  let pendingTimer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> = Promise.resolve();

  // La siguiente ejecución se programa al terminar la anterior: nunca se solapan.
  const scheduleNext = () => {
    if (isStopping) return;
    pendingTimer = setTimeout(() => {
      currentRun = runOnce(dependencies).then(scheduleNext);
    }, env.SYNC_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND);
  };

  const stop = (signal: string) => {
    if (isStopping) return;
    isStopping = true;
    clearTimeout(pendingTimer);
    logger.info('sync.stopping', { signal });
    void currentRun.then(closeConnections);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  logger.info('sync.started', {
    intervalSeconds: env.SYNC_INTERVAL_SECONDS,
    source: env.ADMIN_NEW_DB_NAME,
  });
  currentRun = runOnce(dependencies).then(scheduleNext);
}

run().catch((error: unknown) => {
  logger.error('sync.start_failed', error);
  process.exitCode = 1;
});
