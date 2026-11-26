import { describe, expect, it } from 'vitest';
import type { Database } from '../../../platform/database/database.js';
import type { Clock } from '../../../platform/clock/clock.js';
import { isAllowedPushEndpoint } from './push-subscriptions.js';
import { processPushDeliveries, pushFailureCode, pushFailureStatus } from './push-deliveries.js';

describe('Web Push boundaries', () => {
  it('accepts Chrome and Edge push services and rejects arbitrary destinations', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/synthetic-token')).toBe(true);
    expect(
      isAllowedPushEndpoint('https://wns2-pn1p.notify.windows.com/w/?token=synthetic-token'),
    ).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/synthetic-token')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.test/fcm/send/1')).toBe(
      false,
    );
    expect(isAllowedPushEndpoint('https://127.0.0.1/fcm/send/1')).toBe(false);
    expect(isAllowedPushEndpoint('https://notify.windows.com.attacker.test/w/?token=1')).toBe(false);
    expect(isAllowedPushEndpoint('https://wns2-pn1p.notify.windows.com:8443/w/?token=1')).toBe(
      false,
    );
    expect(isAllowedPushEndpoint('https://wns2-pn1p.notify.windows.com/other')).toBe(false);
  });

  it('only treats expired subscriptions as permanent delivery failures', () => {
    expect(pushFailureStatus({ statusCode: 404 })).toBe('expired');
    expect(pushFailureStatus({ statusCode: 410 })).toBe('expired');
    expect(pushFailureStatus({ statusCode: 503 })).toBe('retry');
    expect(pushFailureStatus(new Error('offline'))).toBe('retry');
    expect(pushFailureCode({ statusCode: 403 })).toBe('PushHttp403');
    expect(pushFailureCode({ code: 'ENETUNREACH' })).toBe('ENETUNREACH');
    expect(pushFailureCode(new Error('sensitive endpoint'))).toBe('DeliveryFailed');
  });

  it('sends a generic payload after claiming the delivery', async () => {
    const statements: string[] = [];
    const delivery = {
      id: 7,
      subscription_id: 3,
      attempts: 0,
      endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-token',
      p256dh: 'synthetic-key',
      auth: 'synthetic-auth',
      revoked_at: null,
      user_status: 'ACTIVE',
    };
    const execute = (statement: string): Promise<[unknown[]]> => {
      statements.push(statement);
      return Promise.resolve([statement.includes('SELECT pd.id') ? [delivery] : []]);
    };
    const database = {
      pool: {
        getConnection: () =>
          Promise.resolve({
            beginTransaction: () => Promise.resolve(),
            commit: () => Promise.resolve(),
            rollback: () => Promise.resolve(),
            release: () => {},
            execute,
          }),
        execute,
      },
    } as unknown as Database;
    const clock: Clock = { now: () => new Date('2026-11-26T12:00:00Z') };
    let payload = '';
    const send = (_subscription: unknown, body: string) => {
      payload = body;
      return Promise.resolve({ statusCode: 201 });
    };

    const count = await processPushDeliveries(
      database,
      clock,
      'test-worker',
      {
        subject: 'mailto:synthetic@example.invalid',
        publicKey: 'public',
        privateKey: 'private',
      },
      send,
    );

    expect(count).toBe(1);
    expect(statements.some((statement) => statement.includes("status = 'PROCESSING'"))).toBe(true);
    expect(statements.some((statement) => statement.includes("status = 'COMPLETED'"))).toBe(true);
    expect(payload).toContain('Tienes una nueva notificación');
    expect(payload).not.toContain('synthetic-token');
  });
});
