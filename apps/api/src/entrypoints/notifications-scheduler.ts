import { toDatabaseSettings } from '../config/database-settings.js';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '../config/env.js';
import { processDueNotificationJobs } from '../modules/notifications/application/notification-processor.js';
import { systemClock } from '../platform/clock/clock.js';
import { connectDatabase } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

const INTERVAL_MILLISECONDS = 15_000;

async function run(): Promise<void> {
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  const workerId = `notifications-scheduler-${randomUUID()}`;
  let isStopping = false;
  let timer: NodeJS.Timeout | undefined;
  const iterate = async () => {
    if (isStopping) return;
    try {
      await processDueNotificationJobs(
        { database, clock: systemClock, enablePush: Boolean(env.PUSH_VAPID_PUBLIC_KEY) }, workerId,
      );
    } catch (error) {
      logger.error('notifications.scheduler_failed', error);
    }
    timer = setTimeout(() => void iterate(), INTERVAL_MILLISECONDS);
  };
  const stop = (signal: string) => {
    if (isStopping) return;
    isStopping = true;
    clearTimeout(timer);
    logger.info('notifications.scheduler_stopping', { signal });
    void database.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  logger.info('notifications.scheduler_started');
  await iterate();
}

run().catch((error: unknown) => {
  logger.error('notifications.scheduler_start_failed', error);
  process.exitCode = 1;
});
