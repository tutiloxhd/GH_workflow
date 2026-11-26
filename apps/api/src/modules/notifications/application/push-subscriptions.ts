import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../../platform/database/database.js';

export interface BrowserPushSubscription {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

const endpointHash = (endpoint: string): string =>
  createHash('sha256').update(endpoint).digest('hex');

// Solo aceptamos los servicios push de Chrome y Edge.
// Una URL arbitraria permitiría al worker solicitar recursos internos (SSRF).
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const isChromeEndpoint =
      url.hostname === 'fcm.googleapis.com' && /^\/fcm\/send\/[^/]+$/.test(url.pathname);
    const isEdgeEndpoint =
      url.hostname.endsWith('.notify.windows.com') &&
      url.hostname !== '.notify.windows.com' &&
      url.pathname.startsWith('/w/');
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '' &&
      (isChromeEndpoint || isEdgeEndpoint)
    );
  } catch {
    return false;
  }
}

interface SubscriptionRow extends RowDataPacket {
  readonly id: number;
  readonly user_id: number;
}

export async function savePushSubscription(
  database: Database,
  userId: number,
  subscription: BrowserPushSubscription,
): Promise<'saved' | 'owned-by-another-user'> {
  const hash = endpointHash(subscription.endpoint);
  const connection = await database.pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<SubscriptionRow[]>(
      'SELECT id, user_id FROM push_subscriptions WHERE endpoint_hash = ? FOR UPDATE',
      [hash],
    );
    if (existing[0] && existing[0].user_id !== userId) {
      await connection.rollback();
      return 'owned-by-another-user';
    }
    await connection.execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint),
         p256dh = VALUES(p256dh), auth = VALUES(auth), revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP(6)`,
      [userId, subscription.endpoint, hash, subscription.keys.p256dh, subscription.keys.auth],
    );
    await connection.commit();
    return 'saved';
  } catch (error) {
    await connection.rollback();
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      return 'owned-by-another-user';
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function hasPushSubscription(
  database: Database,
  userId: number,
  endpoint: string,
): Promise<boolean> {
  const [rows] = await database.pool.execute<SubscriptionRow[]>(
    `SELECT id, user_id FROM push_subscriptions
      WHERE endpoint_hash = ? AND user_id = ? AND revoked_at IS NULL`,
    [endpointHash(endpoint), userId],
  );
  return rows.length > 0;
}

export async function revokePushSubscription(
  database: Database,
  userId: number,
  endpoint: string,
): Promise<void> {
  const hash = endpointHash(endpoint);
  await database.pool.execute(
    `UPDATE push_subscriptions SET revoked_at = CURRENT_TIMESTAMP(6)
      WHERE endpoint_hash = ? AND user_id = ? AND revoked_at IS NULL`,
    [hash, userId],
  );
  await database.pool.execute(
    `UPDATE push_deliveries pd JOIN push_subscriptions ps ON ps.id = pd.subscription_id
       SET pd.status = 'CANCELLED', pd.locked_by = NULL, pd.locked_until = NULL
     WHERE ps.endpoint_hash = ? AND ps.user_id = ? AND pd.status = 'PENDING'`,
    [hash, userId],
  );
}
