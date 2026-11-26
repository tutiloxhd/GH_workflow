import type { RowDataPacket } from 'mysql2/promise';
import { sendNotification } from 'web-push';
import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';

const BATCH_SIZE = 25;
const LEASE_MILLISECONDS = 60_000;
const MAX_ATTEMPTS = 5;
const PUSH_TIMEOUT_MILLISECONDS = 10_000;
const PUSH_TTL_SECONDS = 60 * 60;

export interface PushSettings {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

interface DeliveryRow extends RowDataPacket {
  readonly id: number;
  readonly subscription_id: number;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly revoked_at: Date | null;
  readonly user_status: string;
  readonly attempts: number;
}

export async function enqueuePushDeliveries(
  database: Database,
  notificationId: number,
  userId: number,
): Promise<void> {
  await database.pool.execute(
    `INSERT IGNORE INTO push_deliveries (notification_id, subscription_id)
      SELECT ?, id FROM push_subscriptions WHERE user_id = ? AND revoked_at IS NULL`,
    [notificationId, userId],
  );
}

export function pushFailureStatus(error: unknown): 'expired' | 'retry' {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return 'retry';
  const statusCode = error.statusCode;
  return statusCode === 404 || statusCode === 410 ? 'expired' : 'retry';
}

export function pushFailureCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'DeliveryFailed';
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return `PushHttp${error.statusCode}`;
  }
  if ('code' in error && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)) {
    return error.code.slice(0, 100);
  }
  return 'DeliveryFailed';
}

export async function processPushDeliveries(
  database: Database,
  clock: Clock,
  workerId: string,
  settings: PushSettings,
  send: typeof sendNotification = sendNotification,
): Promise<number> {
  const now = clock.now();
  const leaseUntil = new Date(now.getTime() + LEASE_MILLISECONDS);
  const connection = await database.pool.getConnection();
  let deliveries: DeliveryRow[] = [];
  try {
    await connection.beginTransaction();
    const [selected] = await connection.execute<DeliveryRow[]>(
      `SELECT pd.id, pd.subscription_id, pd.attempts, ps.endpoint, ps.p256dh, ps.auth,
              ps.revoked_at, u.status AS user_status
         FROM push_deliveries pd JOIN push_subscriptions ps ON ps.id = pd.subscription_id
         JOIN users u ON u.id = ps.user_id
        WHERE pd.available_at <= ?
          AND (pd.status = 'PENDING' OR (pd.status = 'PROCESSING' AND pd.locked_until < ?))
        ORDER BY pd.available_at, pd.id LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED`,
      [now, now],
    );
    deliveries = selected;
    for (const delivery of deliveries) {
      await connection.execute(
        `UPDATE push_deliveries SET status = 'PROCESSING', attempts = attempts + 1,
           locked_by = ?, locked_until = ? WHERE id = ?`,
        [workerId, leaseUntil, delivery.id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  for (const delivery of deliveries) {
    if (delivery.revoked_at || delivery.user_status !== 'ACTIVE') {
      await database.pool.execute(
        `UPDATE push_deliveries SET status = 'CANCELLED', locked_by = NULL, locked_until = NULL
         WHERE id = ? AND locked_by = ?`,
        [delivery.id, workerId],
      );
      continue;
    }
    try {
      await send(
        { endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth } },
        JSON.stringify({
          notification: {
            title: 'GrupoHouse',
            body: 'Tienes una nueva notificación.',
            icon: '/icons/icon-192.png',
            data: {
              onActionClick: {
                default: { operation: 'focusLastFocusedOrOpen', url: '/mis-tareas' },
              },
            },
          },
        }),
        {
          vapidDetails: settings,
          TTL: PUSH_TTL_SECONDS,
          timeout: PUSH_TIMEOUT_MILLISECONDS,
        },
      );
      await database.pool.execute(
        `UPDATE push_deliveries SET status = 'COMPLETED', completed_at = ?,
           locked_by = NULL, locked_until = NULL, last_error = NULL
         WHERE id = ? AND locked_by = ?`,
        [clock.now(), delivery.id, workerId],
      );
    } catch (error) {
      const isExpired = pushFailureStatus(error) === 'expired';
      if (isExpired) {
        await database.pool.execute(
          'UPDATE push_subscriptions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
          [clock.now(), delivery.subscription_id],
        );
      }
      const isFinal = isExpired || delivery.attempts + 1 >= MAX_ATTEMPTS;
      const retryAt = new Date(
        clock.now().getTime() + 2 ** Math.min(delivery.attempts + 1, 6) * 60_000,
      );
      await database.pool.execute(
        `UPDATE push_deliveries SET status = ?, available_at = ?, locked_by = NULL,
           locked_until = NULL, last_error = ? WHERE id = ? AND locked_by = ?`,
        [
          isFinal ? 'FAILED' : 'PENDING',
          retryAt,
          isExpired ? 'SubscriptionExpired' : pushFailureCode(error),
          delivery.id,
          workerId,
        ],
      );
    }
  }
  return deliveries.length;
}
