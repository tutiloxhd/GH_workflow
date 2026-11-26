import { randomUUID } from 'node:crypto';
import { toDatabaseSettings } from '../config/database-settings.js';
import { parseEnv } from '../config/env.js';
import { processNotificationOutbox } from '../modules/notifications/application/notification-processor.js';
import { processPushDeliveries } from '../modules/notifications/application/push-deliveries.js';
import { systemClock } from '../platform/clock/clock.js';
import { connectDatabase } from '../platform/database/database.js';
import { logger } from '../platform/logging/logger.js';

const IDLE_DELAY_MILLISECONDS = 5_000;

async function run(): Promise<void> {
  const env = parseEnv(process.env);
  const database = connectDatabase(toDatabaseSettings(env));
  const pushSettings = env.PUSH_VAPID_SUBJECT && env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY
    ? { subject: env.PUSH_VAPID_SUBJECT, publicKey: env.PUSH_VAPID_PUBLIC_KEY, privateKey: env.PUSH_VAPID_PRIVATE_KEY }
    : null;
  const workerId = `notifications-worker-${randomUUID()}`;
  let isStopping = false;
  let timer: NodeJS.Timeout | undefined;

  const schedule = (delay: number) => {
    if (isStopping) return;
    timer = setTimeout(() => void iterate(), delay);
  };
  const iterate = async () => {
    try {
      const processed = await processNotificationOutbox(
        { database, clock: systemClock, enablePush: pushSettings !== null }, workerId,
      );
      const pushProcessed = pushSettings
        ? await processPushDeliveries(database, systemClock, workerId, pushSettings)
        : 0;
      schedule(processed + pushProcessed > 0 ? 0 : IDLE_DELAY_MILLISECONDS);
    } catch (error) {
      logger.error('notifications.worker_failed', error);
      schedule(IDLE_DELAY_MILLISECONDS);
    }
  };
  const stop = (signal: string) => {
    if (isStopping) return;
    isStopping = true;
    clearTimeout(timer);
    logger.info('notifications.worker_stopping', { signal });
    void database.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  logger.info('notifications.worker_started', { workerId });
  await iterate();
}

run().catch((error: unknown) => {
  logger.error('notifications.worker_start_failed', error);
  process.exitCode = 1;
});
